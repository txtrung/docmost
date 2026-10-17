import { Cache } from 'cache-manager';
import { issueIdFromMembershipRow } from './plane-membership';
import { PlaneService } from './plane.service';

type Json = Record<string, unknown>;

function issue(
  id: string,
  name: string,
  start: string,
  end: string,
  sequence: number,
  extra: Json = {},
): Json {
  return {
    id,
    sequence_id: sequence,
    name,
    priority: 'medium',
    start_date: start,
    target_date: end,
    updated_at: '2026-10-17T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    state: { id: 'state1', name: 'Started', group: 'started', color: '#00aa00' },
    assignees: [{ id: 'user1', email: 'lan@example.com', display_name: 'Lan' }],
    labels: [],
    ...extra,
  };
}

const flidocIssues = [
  issue('p1', 'Plane API', '2026-10-15', '2026-10-15', 1),
  issue('p2', 'Sync tasks', '2026-10-15', '2026-10-15', 2),
  issue('v1', 'Brand', '2026-10-15', '2026-10-15', 3),
  issue('s1', 'SSO button', '2026-11-03', '2026-11-05', 4),
  issue('bare', 'No module', '2026-10-18', '2026-10-18', 5),
];

const embeddedIssues = [
  issue('e1', 'Embedded', '2026-10-15', '2026-10-16', 1, {
    module_ids: ['mod-kept'],
    cycle_id: 'cyc-kept',
  }),
];

function envelope(results: Json[], cursor: string | null) {
  return {
    grouped_by: null,
    sub_grouped_by: null,
    total_count: results.length,
    next_cursor: cursor ?? '',
    prev_cursor: '',
    next_page_results: Boolean(cursor),
    prev_page_results: false,
    count: results.length,
    total_pages: cursor ? 2 : 1,
    total_results: results.length,
    extra_stats: null,
    results,
  };
}

function moduleIssues(moduleId: string, cursor: string | null) {
  if (moduleId === 'mod-plane' && !cursor) {
    return envelope([issue('p1', 'Plane API', '2026-10-15', '2026-10-15', 1)], 'page-2');
  }
  if (moduleId === 'mod-plane' && cursor === 'page-2') {
    return envelope([issue('p2', 'Sync tasks', '2026-10-15', '2026-10-15', 2)], null);
  }
  if (moduleId === 'mod-vi') {
    return envelope([issue('v1', 'Brand', '2026-10-15', '2026-10-15', 3)], null);
  }
  if (moduleId === 'mod-sso') {
    return envelope([issue('s1', 'SSO button', '2026-11-03', '2026-11-05', 4)], null);
  }
  return envelope([], null);
}

function cycleIssues(cycleId: string, cursor: string | null) {
  if (cycleId === 'cyc-oct' && !cursor) {
    return envelope([issue('p1', 'Plane API', '2026-10-15', '2026-10-15', 1)], 'page-2');
  }
  if (cycleId === 'cyc-oct' && cursor === 'page-2') {
    return envelope(
      [
        issue('p2', 'Sync tasks', '2026-10-15', '2026-10-15', 2),
        issue('v1', 'Brand', '2026-10-15', '2026-10-15', 3),
      ],
      null,
    );
  }
  if (cycleId === 'cyc-sso') {
    return envelope([issue('s1', 'SSO button', '2026-11-03', '2026-11-05', 4)], null);
  }
  return envelope([], null);
}

function respond(url: string, method: string): { status: number; body: unknown } {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, '');
  const project = path.match(/\/projects\/([^/]+)/)?.[1] ?? '';
  const cursor = parsed.searchParams.get('cursor');

  if (path.endsWith('/projects')) {
    return {
      status: 200,
      body: [
        { id: 'proj-flidoc', name: 'FLIDOC', identifier: 'FLI' },
        { id: 'proj-embedded', name: 'Embedded', identifier: 'EMB' },
      ],
    };
  }
  if (path.endsWith('/members')) {
    return {
      status: 200,
      body: [
        {
          id: 'member1',
          member: { id: 'user1', email: 'lan@example.com', display_name: 'Lan' },
        },
      ],
    };
  }

  const moduleMatch = path.match(/\/modules\/([^/]+)\/module-issues$/);
  if (moduleMatch) return { status: 200, body: moduleIssues(moduleMatch[1], cursor) };
  const cycleMatch = path.match(/\/cycles\/([^/]+)\/cycle-issues$/);
  if (cycleMatch) return { status: 200, body: cycleIssues(cycleMatch[1], cursor) };

  if (project === 'proj-embedded') {
    if (path.endsWith('/modules')) {
      return { status: 200, body: [{ id: 'mod-kept', name: 'Kept' }] };
    }
    if (path.endsWith('/cycles')) {
      return { status: 200, body: [{ id: 'cyc-kept', name: 'Kept cycle' }] };
    }
    if (path.endsWith('/work-items')) return { status: 200, body: embeddedIssues };
    if (/\/projects\/[^/]+$/.test(path)) {
      return { status: 200, body: { id: project, name: 'Embedded', identifier: 'EMB' } };
    }
  }

  if (path.endsWith('/modules')) {
    return {
      status: 200,
      body: [
        { id: 'mod-plane', name: 'Tích hợp Plane' },
        { id: 'mod-vi', name: 'Việt hoá & thương hiệu' },
        { id: 'mod-sso', name: 'Đăng nhập SSO' },
      ],
    };
  }
  if (path.endsWith('/cycles')) {
    return {
      status: 200,
      body: [
        { id: 'cyc-oct', name: 'October' },
        { id: 'cyc-sso', name: 'SSO' },
      ],
    };
  }
  if (path.endsWith('/work-items') && method === 'POST') {
    return { status: 201, body: issue('created', 'Created', '2026-10-20', '2026-10-21', 99) };
  }
  if (path.endsWith('/work-items')) return { status: 200, body: flidocIssues };
  if (/\/projects\/[^/]+$/.test(path)) {
    return { status: 200, body: { id: project, name: 'FLIDOC', identifier: 'FLI' } };
  }
  return { status: 404, body: { error: path } };
}

function memoryCache(): Cache {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
  } as unknown as Cache;
}

function laneOf(model: { bars: { planeId: string | null; laneId: string }[] }, planeId: string) {
  return model.bars.find((bar) => bar.planeId === planeId)?.laneId;
}

describe('Plane membership from module-issues and cycle-issues', () => {
  const urls: string[] = [];
  let service: PlaneService;
  const realFetch = global.fetch;

  beforeEach(() => {
    urls.length = 0;
    global.fetch = (async (url: string, init?: { method?: string }) => {
      urls.push(String(url));
      const result = respond(String(url), init?.method ?? 'GET');
      return {
        status: result.status,
        headers: { get: () => null },
        text: async () => JSON.stringify(result.body),
      };
    }) as unknown as typeof fetch;

    service = new PlaneService(
      {
        getPlaneApiUrl: () => 'http://plane.test',
        getPlaneWorkspaceSlug: () => 'acme',
        getPlaneApiKey: () => 'test-key',
      } as any,
      { lease: async () => ({ dispatcher: {}, release: async () => undefined }) } as any,
      { findById: async () => ({ id: 'page1' }) } as any,
      { validateCanEdit: async () => undefined } as any,
      memoryCache(),
    );
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  function membershipUrls() {
    return urls.filter(
      (url) => url.includes('/module-issues') || url.includes('/cycle-issues'),
    );
  }

  it('puts IssueSerializer work items into module lanes from module-issues', async () => {
    const { model } = await service.buildRoadmap('lan@example.com', 'proj-flidoc', 'modules', undefined);

    expect(laneOf(model, 'p1')).toBe('plane:lane:mod-plane');
    expect(laneOf(model, 'p2')).toBe('plane:lane:mod-plane');
    expect(laneOf(model, 'v1')).toBe('plane:lane:mod-vi');
    expect(laneOf(model, 's1')).toBe('plane:lane:mod-sso');
    expect(laneOf(model, 'bare')).toBe('plane:lane:unassigned');
    expect(membershipUrls().some((url) => url.includes('/modules/mod-plane/module-issues'))).toBe(true);
    expect(membershipUrls().some((url) => url.includes('cursor=page-2'))).toBe(true);
  });

  it('puts IssueSerializer work items into cycle lanes from cycle-issues', async () => {
    const { model } = await service.buildRoadmap('lan@example.com', 'proj-flidoc', 'cycles', undefined);

    expect(laneOf(model, 'p1')).toBe('plane:lane:cyc-oct');
    expect(laneOf(model, 'p2')).toBe('plane:lane:cyc-oct');
    expect(laneOf(model, 'v1')).toBe('plane:lane:cyc-oct');
    expect(laneOf(model, 's1')).toBe('plane:lane:cyc-sso');
    expect(laneOf(model, 'bare')).toBe('plane:lane:unassigned');
    expect(membershipUrls().some((url) => url.includes('/cycles/cyc-oct/cycle-issues'))).toBe(true);
  });

  it('filters and queries module and cycle from the same membership', async () => {
    const byModule = await service.listWorkItems('lan@example.com', 'proj-flidoc', {
      module: 'mod-plane',
    });
    expect(byModule.items.map((item) => item.id).sort()).toEqual(['p1', 'p2']);

    const byCycle = await service.listWorkItems('lan@example.com', 'proj-flidoc', {
      cycle: 'cyc-oct',
    });
    expect(byCycle.items.map((item) => item.id).sort()).toEqual(['p1', 'p2', 'v1']);

    const moduleQuery = await service.listWorkItems('lan@example.com', 'proj-flidoc', {
      query: 'module = "mod-vi"',
    });
    expect(moduleQuery.items.map((item) => item.id)).toEqual(['v1']);

    const cycleQuery = await service.listWorkItems('lan@example.com', 'proj-flidoc', {
      query: 'cycle = "cyc-sso"',
    });
    expect(cycleQuery.items.map((item) => item.id)).toEqual(['s1']);

    const both = await service.listWorkItems('lan@example.com', 'proj-flidoc', {
      query: 'module = "mod-plane" AND cycle = "cyc-oct"',
    });
    expect(both.items.map((item) => item.id).sort()).toEqual(['p1', 'p2']);
  });

  it('reuses cached membership and drops it when a work item is created', async () => {
    await service.buildRoadmap('lan@example.com', 'proj-flidoc', 'modules', undefined);
    const first = membershipUrls().length;
    expect(first).toBeGreaterThan(0);

    await service.buildRoadmap('lan@example.com', 'proj-flidoc', 'modules', undefined);
    expect(membershipUrls().length).toBe(first);

    await service.createWorkItem(
      { id: 'user1', email: 'lan@example.com' } as any,
      { pageId: 'page1', projectId: 'proj-flidoc', title: 'Created' },
    );
    await service.buildRoadmap('lan@example.com', 'proj-flidoc', 'modules', undefined);
    expect(membershipUrls().length).toBeGreaterThan(first);
  });

  it('keeps module_ids and cycle_id from the work item and skips membership', async () => {
    const { model } = await service.buildRoadmap(
      'lan@example.com',
      'proj-embedded',
      'modules',
      undefined,
    );
    expect(laneOf(model, 'e1')).toBe('plane:lane:mod-kept');
    expect(membershipUrls()).toEqual([]);

    const cycles = await service.buildRoadmap(
      'lan@example.com',
      'proj-embedded',
      'cycles',
      undefined,
    );
    expect(laneOf(cycles.model, 'e1')).toBe('plane:lane:cyc-kept');
    expect(membershipUrls()).toEqual([]);
  });

  it('does not load membership for a filter that ignores module and cycle', async () => {
    const listed = await service.listWorkItems('lan@example.com', 'proj-flidoc', {
      priority: 'medium',
    });
    expect(listed.total).toBe(flidocIssues.length);
    expect(membershipUrls()).toEqual([]);

    await service.buildRoadmap('lan@example.com', 'proj-flidoc', 'workItems', undefined);
    expect(membershipUrls()).toEqual([]);
  });
});

describe('issueIdFromMembershipRow', () => {
  it('reads the work item id from a Plane issue object', () => {
    expect(
      issueIdFromMembershipRow({
        id: 'p1',
        name: 'Plane API',
        sequence_id: 1,
        priority: 'medium',
        project: 'proj-flidoc',
        state: 'state1',
        start_date: '2026-10-15',
        target_date: '2026-10-15',
      }),
    ).toBe('p1');
  });

  it('reads a through-table row from issue, not from the row id', () => {
    expect(
      issueIdFromMembershipRow({ id: 'join-1', issue: 'p1', module: 'mod-plane' }),
    ).toBe('p1');
    expect(
      issueIdFromMembershipRow({ id: 'join-2', issue: { id: 'p2' }, module: 'mod-plane' }),
    ).toBe('p2');
    expect(
      issueIdFromMembershipRow({ id: 'join-3', issue_detail: { id: 's1' }, cycle: 'cyc-sso' }),
    ).toBe('s1');
    expect(issueIdFromMembershipRow({ id: 'join-4', module: 'mod-plane' })).toBeNull();
    expect(issueIdFromMembershipRow({ id: 'join-5', cycle: 'cyc-oct' })).toBeNull();
  });
});
