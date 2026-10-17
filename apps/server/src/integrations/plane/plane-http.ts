import { Logger } from '@nestjs/common';

export const PLANE_CACHE_TTL_MS = 60_000;
export const PLANE_MAX_PAGES = 10;
export const PLANE_PAGE_SIZE = 100;

export class PlaneHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PlaneHttpError';
  }
}

export type PlaneFetchResponse = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type PlaneFetch = (
  url: string,
  init: {
    headers: Record<string, string>;
    method?: string;
    body?: string;
    dispatcher?: unknown;
  },
) => Promise<PlaneFetchResponse>;

export type WorkItemCollection = 'work-items' | 'issues';

const RETRY_AFTER_SECONDS = /^\d+(\.\d+)?$/;

export function joinPlaneUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '');
  const suffix = path.replace(/^\/+/, '');
  if (/\/api\/v1$/i.test(trimmed)) {
    return `${trimmed}/${suffix}`;
  }
  return `${trimmed}/api/v1/${suffix}`;
}

export function parseRetryAfterMs(header: string | null, now: number): number {
  if (!header) return 1000;
  const trimmed = header.trim();
  if (RETRY_AFTER_SECONDS.test(trimmed)) {
    return Math.min(Number(trimmed), 60) * 1000;
  }
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    return Math.min(Math.max(date - now, 0), 60_000);
  }
  return 1000;
}

export function unwrapPlaneList(body: unknown): {
  items: unknown[];
  nextCursor: string | null;
} {
  if (Array.isArray(body)) {
    return { items: body, nextCursor: null };
  }
  if (!body || typeof body !== 'object') {
    return { items: [], nextCursor: null };
  }

  const record = body as Record<string, unknown>;
  const items = Array.isArray(record.results)
    ? record.results
    : Array.isArray(record.data)
      ? record.data
      : [];

  if (record.next_page_results === false) {
    return { items, nextCursor: null };
  }

  if (typeof record.next_cursor === 'string' && record.next_cursor) {
    return { items, nextCursor: record.next_cursor };
  }

  if (typeof record.next === 'string' && record.next) {
    try {
      const url = new URL(record.next, 'http://plane.local');
      const cursor = url.searchParams.get('cursor');
      return { items, nextCursor: cursor || null };
    } catch {
      return { items, nextCursor: null };
    }
  }

  return { items, nextCursor: null };
}

function withCursor(url: string, cursor: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('cursor', cursor);
  return parsed.toString();
}

async function readBody(response: PlaneFetchResponse): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const planeHttpLogger = new Logger('PlaneHttp');
const DEFAULT_DEBUG_BODY_LIMIT = 4000;

export function planeDebugEnabled(): boolean {
  return process.env.PLANE_DEBUG?.trim().toLowerCase() === 'true';
}

function planeDebugBodyLimit(): number {
  const raw = process.env.PLANE_DEBUG_BODY_LIMIT?.trim();
  if (!raw) return DEFAULT_DEBUG_BODY_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DEBUG_BODY_LIMIT;
  return Math.trunc(value);
}

function redactSecret(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join('***');
}

function formatDebugBody(value: unknown, apiKey: string): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : (JSON.stringify(value, null, 2) ?? 'null');
  } catch {
    text = String(value);
  }
  text = redactSecret(text, apiKey);
  const limit = planeDebugBodyLimit();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n... truncated`;
}

export function logPlaneDebug(message: string): void {
  if (!planeDebugEnabled()) return;
  planeHttpLogger.log(message);
}

function logPlaneExchange(input: {
  method: string;
  url: string;
  apiKey: string;
  requestBody?: unknown;
  status: number;
  startedAt: number;
  responseBody: unknown;
  retryInMs?: number;
}): void {
  if (!planeDebugEnabled()) return;
  const elapsed = Date.now() - input.startedAt;
  const retry = input.retryInMs === undefined ? '' : ` retry in ${input.retryInMs}ms`;
  const lines = [
    `${input.method} ${redactSecret(input.url, input.apiKey)} ${input.status} ${elapsed}ms${retry}`,
  ];
  if (input.requestBody !== undefined) {
    lines.push(`request ${formatDebugBody(input.requestBody, input.apiKey)}`);
  }
  lines.push(`response ${formatDebugBody(input.responseBody, input.apiKey)}`);
  planeHttpLogger.log(lines.join('\n'));
}

export async function planeRequest(options: {
  url: string;
  apiKey: string;
  fetchImpl: PlaneFetch;
  method?: string;
  body?: unknown;
  dispatcher?: unknown;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  retry?: boolean;
}): Promise<{ status: number; body: unknown }> {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const method = options.method ?? 'GET';
  const retry = options.retry !== false && method === 'GET';

  const call = () =>
    options.fetchImpl(options.url, {
      method,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'X-API-Key': options.apiKey,
      },
      dispatcher: options.dispatcher,
    });

  const startedAt = Date.now();
  let response = await call();
  if (retry && response.status === 429) {
    const wait = parseRetryAfterMs(response.headers.get('retry-after'), now());
    logPlaneExchange({
      method,
      url: options.url,
      apiKey: options.apiKey,
      requestBody: options.body,
      status: response.status,
      startedAt,
      responseBody: await readBody(response),
      retryInMs: wait,
    });
    await sleep(wait);
    const retryStartedAt = Date.now();
    response = await call();
    const body = await readBody(response);
    logPlaneExchange({
      method,
      url: options.url,
      apiKey: options.apiKey,
      requestBody: options.body,
      status: response.status,
      startedAt: retryStartedAt,
      responseBody: body,
    });
    return { status: response.status, body };
  }

  const body = await readBody(response);
  logPlaneExchange({
    method,
    url: options.url,
    apiKey: options.apiKey,
    requestBody: options.body,
    status: response.status,
    startedAt,
    responseBody: body,
  });
  return { status: response.status, body };
}

export async function planeListAll(options: {
  url: string;
  apiKey: string;
  fetchImpl: PlaneFetch;
  dispatcher?: unknown;
  maxPages?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<unknown[]> {
  const maxPages = options.maxPages ?? PLANE_MAX_PAGES;
  const items: unknown[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const pageUrl = cursor ? withCursor(options.url, cursor) : options.url;
    const { status, body } = await planeRequest({ ...options, url: pageUrl });
    if (status === 404) {
      throw new PlaneHttpError('Not found', 404);
    }
    if (status === 429) {
      throw new PlaneHttpError('Plane rate limit exceeded.', 429);
    }
    if (status < 200 || status >= 300) {
      throw new PlaneHttpError('Plane request failed.', status);
    }

    const pageResult = unwrapPlaneList(body);
    items.push(...pageResult.items);
    if (!pageResult.nextCursor || pageResult.nextCursor === cursor) {
      break;
    }
    cursor = pageResult.nextCursor;
  }

  return items;
}

export async function detectWorkItemCollection(options: {
  projectUrl: string;
  apiKey: string;
  fetchImpl: PlaneFetch;
  remembered?: WorkItemCollection | null;
  dispatcher?: unknown;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<WorkItemCollection> {
  const remembered = options.remembered;
  const order: WorkItemCollection[] = remembered
    ? [remembered, remembered === 'work-items' ? 'issues' : 'work-items']
    : ['work-items', 'issues'];

  for (const collection of order) {
    const url = `${options.projectUrl.replace(/\/+$/, '')}/${collection}/?per_page=1`;
    const { status } = await planeRequest({ ...options, url });
    if (status >= 200 && status < 300) return collection;
    if (status === 404) continue;
    if (status === 429) {
      throw new PlaneHttpError('Plane rate limit exceeded.', 429);
    }
    throw new PlaneHttpError('Plane request failed.', status);
  }

  throw new PlaneHttpError('Not found', 404);
}
