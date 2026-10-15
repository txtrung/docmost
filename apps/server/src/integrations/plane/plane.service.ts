import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
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
} from './plane-http';
import {
  normalizeCycle,
  normalizeLabelRecord,
  normalizeModule,
  normalizePerson,
  normalizeProject,
  normalizeState,
  normalizeWorkItem,
} from './plane-normalize';
import { filterPlaneWorkItems, sanitizePlaneFilters } from './plane-filters';
import { buildPlaneGantt, formatPlaneRoadmapMarker } from './plane-gantt';
import {
  NormalizedPlaneTask,
  PlaneCycle,
  PlaneGanttGrouping,
  PlaneLabel,
  PlaneModule,
  PlanePerson,
  PlaneProject,
  PlaneState,
} from './plane.types';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COLLECTION_TTL_MS = 10 * 60 * 1000;

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

  async listWorkItems(email: string, projectId: string, filters: unknown) {
    const config = this.requireConfig();
    this.assertId(projectId);
    const normalizedEmail = this.requireEmail(email);
    await this.assertMember(config, projectId, normalizedEmail);
    const tasks = await this.cachedWorkItems(config, projectId);
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

  async buildRoadmap(
    email: string,
    projectId: string,
    grouping: PlaneGanttGrouping,
  ) {
    const config = this.requireConfig();
    this.assertId(projectId);
    const normalizedEmail = this.requireEmail(email);
    await this.assertMember(config, projectId, normalizedEmail);

    const projects = await this.cachedProjects(config);
    const project = projects.find((item) => item.id === projectId);
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

    const chart = buildPlaneGantt({
      title: project?.name || 'Plane',
      grouping,
      tasks,
      cycles,
      modules,
    });

    if (!chart.taskCount) {
      return { mermaid: '', taskCount: 0 };
    }

    return {
      mermaid: `${formatPlaneRoadmapMarker(projectId, grouping)}\n${chart.mermaid}`,
      taskCount: chart.taskCount,
    };
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
