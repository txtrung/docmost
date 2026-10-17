import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { OutboundAgentFactory } from '../outbound/outbound-agent.factory';
import { EnvironmentService } from '../environment/environment.service';
import { withCache } from '../../common/helpers/with-cache';
import {
  PLANE_CACHE_TTL_MS,
  PLANE_PAGE_SIZE,
  PlaneFetch,
  PlaneHttpError,
  WorkItemCollection,
  detectWorkItemCollection,
  joinPlaneUrl,
  planeListAll,
  planeRequest,
} from './plane-http';
import {
  buildWorkItemPayload,
  normalizeCycle,
  normalizeLabelRecord,
  normalizeModule,
  normalizePerson,
  normalizeProject,
  normalizeState,
  normalizeWorkItem,
} from './plane-normalize';
import { filterPlaneWorkItems, sanitizePlaneFilters } from './plane-filters';
import { parsePlaneQuery, projectClauseAllows, queryToFilters } from './plane-query';
import { buildRoadmapFromPlane, mergeRoadmap } from '@docmost/editor-ext';
import {
  NormalizedPlaneTask,
  PlaneCycle,
  PlaneLabel,
  PlaneModule,
  PlanePerson,
  PlaneProject,
  PlaneRoadmapGrouping,
  PlaneState,
} from './plane.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { User } from '@docmost/db/types/entity.types';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COLLECTION_TTL_MS = 10 * 60 * 1000;

function readQuery(filters: unknown): string | null {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return null;
  if (!Object.prototype.hasOwnProperty.call(filters, 'query')) return null;
  const query = (filters as Record<string, unknown>).query;
  return typeof query === 'string' ? query : '';
}

function parseCurrent(current: string | undefined): unknown {
  if (!current) return null;
  try {
    return JSON.parse(current);
  } catch {
    return null;
  }
}

type PlaneConfig = {
  baseUrl: string;
  slug: string;
  apiKey: string;
  origin: string;
};

@Injectable()
export class PlaneService {
  private readonly logger = new Logger(PlaneService.name);

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly outbound: OutboundAgentFactory,
    private readonly pageRepo: PageRepo,
    private readonly pageAccess: PageAccessService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  isConfigured(): boolean {
    return this.readConfig() !== null;
  }

  async listVisibleProjects(email: string) {
    const config = this.requireConfig();
    const normalizedEmail = this.normalizeEmail(email);
    const projects = await this.cachedProjects(config);
    const visible: PlaneProject[] = [];

    for (const project of projects) {
      try {
        const members = await this.cachedMembers(config, project.id);
        if (this.isMember(members, normalizedEmail)) visible.push(project);
      } catch (error) {
        this.logger.warn(
          `Skipping Plane project ${project.id}: ${this.errorStatus(error)}`,
        );
      }
    }

    return visible;
  }

  async createWorkItem(
    user: User,
    input: {
      pageId: string;
      projectId: string;
      title: string;
      stateId?: string;
      priority?: string;
      assigneeId?: string;
    },
  ): Promise<NormalizedPlaneTask> {
    const config = this.requireConfig();
    this.assertId(input.pageId);
    this.assertId(input.projectId);
    if (input.stateId) this.assertId(input.stateId);
    if (input.assigneeId) this.assertId(input.assigneeId);
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Title is required.');

    const page = await this.pageRepo.findById(input.pageId);
    if (!page) throw new NotFoundException('Page not found.');
    await this.pageAccess.validateCanEdit(page, user);

    const email = this.requireEmail(user.email);
    await this.assertMember(config, input.projectId, email);
    const collection = await this.resolveCollection(config, input.projectId);
    const url = joinPlaneUrl(
      config.baseUrl,
      `workspaces/${config.slug}/projects/${input.projectId}/${collection}/`,
    );
    const { status, body } = await this.guard(() =>
      planeRequest({
        url,
        apiKey: config.apiKey,
        fetchImpl: this.fetchImpl,
        method: 'POST',
        body: buildWorkItemPayload({
          title,
          stateId: input.stateId,
          priority: input.priority,
          assigneeId: input.assigneeId,
        }),
        retry: false,
      }),
    );
    if (status === 429) {
      throw new HttpException('Plane rate limit exceeded.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (status === 404) {
      throw new ForbiddenException('You do not have access to this Plane project.');
    }
    if (status < 200 || status >= 300) {
      throw new BadGatewayException('Plane request failed.');
    }

    await this.dropWorkItemCache(config, input.projectId);
    const projects = await this.cachedProjects(config);
    const item = normalizeWorkItem(body, {
      origin: config.origin,
      workspace: config.slug,
      projectId: input.projectId,
      projectIdentifier:
        projects.find((project) => project.id === input.projectId)?.identifier ?? '',
    });
    if (!item) throw new BadGatewayException('Plane request failed.');
    return item;
  }

  async listWorkItems(email: string, projectId: string, filters: unknown) {
    const config = this.requireConfig();
    this.assertId(projectId);
    const normalizedEmail = this.requireEmail(email);
    await this.assertMember(config, projectId, normalizedEmail);
    const tasks = await this.cachedWorkItems(config, projectId);
    const query = readQuery(filters);
    if (query !== null) {
      const parsed = parsePlaneQuery(query);
      if (parsed.ok === false) throw new BadRequestException(parsed.error);
      const projects = await this.cachedProjects(config);
      const identifier =
        projects.find((project) => project.id === projectId)?.identifier ?? '';
      if (!projectClauseAllows(parsed.value.clauses, projectId, identifier)) {
        return { items: [], total: 0 };
      }
      const paging = sanitizePlaneFilters(filters);
      return filterPlaneWorkItems(
        tasks,
        queryToFilters(parsed.value, paging.page, paging.limit),
        normalizedEmail,
      );
    }
    return filterPlaneWorkItems(
      tasks,
      sanitizePlaneFilters(filters),
      normalizedEmail,
    );
  }

  async listCycles(email: string, projectId: string): Promise<PlaneCycle[]> {
    return this.listProjectResource(email, projectId, 'cycles', normalizeCycle);
  }

  async listModules(email: string, projectId: string): Promise<PlaneModule[]> {
    return this.listProjectResource(email, projectId, 'modules', normalizeModule);
  }

  async listStates(email: string, projectId: string): Promise<PlaneState[]> {
    return this.listProjectResource(email, projectId, 'states', normalizeState);
  }

  async listLabels(email: string, projectId: string): Promise<PlaneLabel[]> {
    return this.listProjectResource(email, projectId, 'labels', normalizeLabelRecord);
  }

  async listMembers(email: string, projectId: string): Promise<PlanePerson[]> {
    const config = this.requireConfig();
    this.assertId(projectId);
    const normalizedEmail = this.requireEmail(email);
    const members = await this.cachedMembers(config, projectId);
    if (!this.isMember(members, normalizedEmail)) {
      throw new ForbiddenException(
        'You do not have access to this Plane project.',
      );
    }
    return members;
  }

  async parseUrl(email: string, rawUrl: string) {
    const config = this.requireConfig();
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { projectId: null, workItemId: null };
    }
    if (url.origin !== config.origin) {
      return { projectId: null, workItemId: null };
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const projectsAt = parts.indexOf('projects');
    const slugAt = parts.indexOf(config.slug);
    if (projectsAt < 0 || slugAt < 0 || slugAt > projectsAt) {
      return { projectId: null, workItemId: null };
    }
    const projectId = parts[projectsAt + 1] ?? '';
    this.assertId(projectId);
    const kind = parts[projectsAt + 2];
    const rawItemId = parts[projectsAt + 3] ?? '';
    let workItemId: string | null = null;
    if ((kind === 'issues' || kind === 'work-items') && rawItemId) {
      this.assertId(rawItemId);
      workItemId = rawItemId;
    }
    await this.assertMember(config, projectId, this.requireEmail(email));
    return { projectId, workItemId };
  }

  async buildRoadmap(
    email: string,
    projectId: string,
    grouping: PlaneRoadmapGrouping,
    current: string | undefined,
  ) {
    const config = this.requireConfig();
    this.assertId(projectId);
    const normalizedEmail = this.requireEmail(email);
    await this.assertMember(config, projectId, normalizedEmail);

    const tasks = await this.cachedWorkItems(config, projectId);
    const cycles =
      grouping === 'cycles'
        ? await this.cachedCollection(config, projectId, 'cycles', normalizeCycle)
        : [];
    const modules =
      grouping === 'modules'
        ? await this.cachedCollection(
            config,
            projectId,
            'modules',
            normalizeModule,
          )
        : [];

    const fresh = buildRoadmapFromPlane({
      projectId,
      grouping,
      lanes:
        grouping === 'cycles'
          ? cycles.map((cycle) => ({ id: cycle.id, title: cycle.name }))
          : grouping === 'modules'
            ? modules.map((moduleItem) => ({
                id: moduleItem.id,
                title: moduleItem.name,
              }))
            : [],
      items: tasks.map((task) => ({
        id: task.id,
        title: task.ref ? `${task.ref} ${task.title}` : task.title,
        start: task.startDate,
        end: task.dueDate,
        laneKey:
          grouping === 'cycles'
            ? task.cycleId
            : grouping === 'modules'
              ? (task.moduleIds[0] ?? null)
              : null,
      })),
    });

    return { model: mergeRoadmap(parseCurrent(current), fresh) };
  }

  private async listProjectResource<T>(
    email: string,
    projectId: string,
    collection: string,
    normalize: (value: unknown) => T | null,
  ): Promise<T[]> {
    const config = this.requireConfig();
    this.assertId(projectId);
    const normalizedEmail = this.requireEmail(email);
    await this.assertMember(config, projectId, normalizedEmail);
    return this.cachedCollection(config, projectId, collection, normalize);
  }

  private async cachedProjects(config: PlaneConfig): Promise<PlaneProject[]> {
    return withCache(
      this.cacheManager,
      this.cacheKey(config, ['projects']),
      PLANE_CACHE_TTL_MS,
      async () => {
        const url = joinPlaneUrl(
          config.baseUrl,
          `workspaces/${config.slug}/projects/?per_page=${PLANE_PAGE_SIZE}`,
        );
        const rows = await this.list(config, url);
        return rows
          .map(normalizeProject)
          .filter((project): project is PlaneProject => Boolean(project));
      },
    );
  }

  private async cachedMembers(
    config: PlaneConfig,
    projectId: string,
  ): Promise<PlanePerson[]> {
    return withCache(
      this.cacheManager,
      this.cacheKey(config, ['members', projectId]),
      PLANE_CACHE_TTL_MS,
      async () => {
        const url = joinPlaneUrl(
          config.baseUrl,
          `workspaces/${config.slug}/projects/${projectId}/members/?per_page=${PLANE_PAGE_SIZE}`,
        );
        const rows = await this.list(config, url);
        return rows
          .map(normalizePerson)
          .filter((person): person is PlanePerson => Boolean(person));
      },
    );
  }

  private async cachedWorkItems(
    config: PlaneConfig,
    projectId: string,
  ): Promise<NormalizedPlaneTask[]> {
    const collection = await this.resolveCollection(config, projectId);
    const projects = await this.cachedProjects(config);
    const identifier =
      projects.find((project) => project.id === projectId)?.identifier ?? '';

    return withCache(
      this.cacheManager,
      this.cacheKey(config, [collection, projectId]),
      PLANE_CACHE_TTL_MS,
      async () => {
        const url = joinPlaneUrl(
          config.baseUrl,
          `workspaces/${config.slug}/projects/${projectId}/${collection}/?per_page=${PLANE_PAGE_SIZE}&expand=assignees,state,labels`,
        );
        const rows = await this.list(config, url);
        return rows
          .map((row) =>
            normalizeWorkItem(row, {
              origin: config.origin,
              workspace: config.slug,
              projectId,
              projectIdentifier: identifier,
            }),
          )
          .filter((task): task is NormalizedPlaneTask => Boolean(task));
      },
    );
  }

  private async cachedCollection<T>(
    config: PlaneConfig,
    projectId: string,
    collection: string,
    normalize: (value: unknown) => T | null,
  ): Promise<T[]> {
    return withCache(
      this.cacheManager,
      this.cacheKey(config, [collection, projectId]),
      PLANE_CACHE_TTL_MS,
      async () => {
        const url = joinPlaneUrl(
          config.baseUrl,
          `workspaces/${config.slug}/projects/${projectId}/${collection}/?per_page=${PLANE_PAGE_SIZE}`,
        );
        const rows = await this.list(config, url);
        return rows
          .map(normalize)
          .filter((item): item is T => Boolean(item));
      },
    );
  }

  private async resolveCollection(
    config: PlaneConfig,
    projectId: string,
  ): Promise<WorkItemCollection> {
    const key = this.cacheKey(config, ['collection']);
    try {
      const cached = await this.cacheManager.get<{ v: WorkItemCollection }>(key);
      if (cached?.v === 'work-items' || cached?.v === 'issues') {
        return cached.v;
      }
    } catch (error) {
      this.logger.warn(`Plane collection cache read failed: ${error}`);
    }

    const projectUrl = joinPlaneUrl(
      config.baseUrl,
      `workspaces/${config.slug}/projects/${projectId}`,
    );
    const collection = await this.guard(() =>
      detectWorkItemCollection({
        projectUrl,
        apiKey: config.apiKey,
        fetchImpl: this.fetchImpl,
      }),
    );

    try {
      await this.cacheManager.set(key, { v: collection }, COLLECTION_TTL_MS);
    } catch (error) {
      this.logger.warn(`Plane collection cache write failed: ${error}`);
    }

    return collection;
  }

  private async list(config: PlaneConfig, url: string): Promise<unknown[]> {
    return this.guard(() =>
      planeListAll({
        url,
        apiKey: config.apiKey,
        fetchImpl: this.fetchImpl,
      }),
    );
  }

  private readonly fetchImpl: PlaneFetch = async (url, init) => {
    const lease = await this.outbound.lease(url);
    try {
      return await fetch(url, {
        method: init.method,
        body: init.body,
        headers: init.headers,
        dispatcher: lease.dispatcher,
      } as RequestInit);
    } finally {
      await lease.release();
    }
  };

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PlaneHttpError) {
        this.logger.warn(`Plane request failed with status ${error.status}`);
        if (error.status === 429) {
          throw new HttpException(
            'Plane rate limit exceeded.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (error.status === 404) {
          throw new ForbiddenException(
            'You do not have access to this Plane project.',
          );
        }
        throw new BadGatewayException('Plane request failed.');
      }
      if (error instanceof HttpException) throw error;
      this.logger.warn(
        `Plane outbound request failed: ${error instanceof Error ? error.message : error}`,
      );
      throw new BadGatewayException('Plane request failed.');
    }
  }

  private async assertMember(
    config: PlaneConfig,
    projectId: string,
    email: string,
  ) {
    const members = await this.cachedMembers(config, projectId);
    if (!this.isMember(members, email)) {
      throw new ForbiddenException(
        'You do not have access to this Plane project.',
      );
    }
  }

  private isMember(members: PlanePerson[], email: string): boolean {
    if (!email) return false;
    return members.some(
      (member) => member.email.trim().toLowerCase() === email,
    );
  }

  private requireEmail(email: string | null | undefined): string {
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      throw new ForbiddenException(
        'You do not have access to this Plane project.',
      );
    }
    return normalized;
  }

  private normalizeEmail(email: string | null | undefined): string {
    return (email ?? '').trim().toLowerCase();
  }

  private assertId(id: string) {
    if (!ID_RE.test(id)) {
      throw new BadRequestException('Invalid Plane id.');
    }
  }

  private async dropWorkItemCache(config: PlaneConfig, projectId: string) {
    const keys = [
      this.cacheKey(config, ['work-items', projectId]),
      this.cacheKey(config, ['issues', projectId]),
    ];
    for (const key of keys) {
      try {
        await this.cacheManager.del(key);
      } catch (error) {
        this.logger.warn(`Plane cache delete failed: ${error}`);
      }
    }
  }

  private cacheKey(config: PlaneConfig, parts: string[]): string {
    return ['plane', 'v1', config.slug, config.origin, ...parts]
      .map((part) => encodeURIComponent(part))
      .join(':');
  }

  private requireConfig(): PlaneConfig {
    const config = this.readConfig();
    if (!config) {
      throw new ServiceUnavailableException('Plane is not configured.');
    }
    return config;
  }

  private readConfig(): PlaneConfig | null {
    const baseUrl = this.environmentService.getPlaneApiUrl()?.trim() ?? '';
    const slug = this.environmentService.getPlaneWorkspaceSlug()?.trim() ?? '';
    const apiKey = this.environmentService.getPlaneApiKey()?.trim() ?? '';
    if (!baseUrl || !slug || !apiKey || !ID_RE.test(slug)) return null;
    try {
      const origin = new URL(baseUrl).origin;
      return { baseUrl: baseUrl.replace(/\/+$/, ''), slug, apiKey, origin };
    } catch {
      return null;
    }
  }

  private errorStatus(error: unknown): string {
    if (error instanceof HttpException) return String(error.getStatus());
    return 'error';
  }
}
