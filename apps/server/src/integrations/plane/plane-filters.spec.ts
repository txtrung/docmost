import { NormalizedPlaneTask } from './plane.types';
import { filterPlaneWorkItems, sanitizePlaneFilters } from './plane-filters';

function task(overrides: Partial<NormalizedPlaneTask> = {}): NormalizedPlaneTask {
  return {
    id: 'task-1',
    sequenceId: 1,
    ref: 'APP-1',
    title: 'Write docs',
    url: 'https://plane.example/ws/projects/p1/issues/task-1',
    priority: 'medium',
    startDate: '2026-01-05',
    dueDate: '2026-01-20',
    updatedAt: '2026-01-10T00:00:00Z',
    stateId: 'state-started',
    stateName: 'In Progress',
    stateGroup: 'started',
    stateColor: '#ff0',
    assignees: [{ id: 'user-1', email: 'Lan@Example.com', name: 'Lan' }],
    labels: [{ id: 'label-1', name: 'Docs', color: '#0f0' }],
    cycleId: 'cycle-1',
    moduleIds: ['module-1'],
    ...overrides,
  };
}

describe('sanitizePlaneFilters', () => {
  it('keeps known fields and drops everything else', () => {
    expect(
      sanitizePlaneFilters({
        state: ' started ',
        assignee: 'me',
        limit: '25',
        apiKey: 'secret',
        search: '',
      }),
    ).toEqual({
      state: 'started',
      assignee: 'me',
      limit: 25,
    });
  });
});

describe('filterPlaneWorkItems', () => {
  const items = [
    task(),
    task({
      id: 'task-2',
      sequenceId: 2,
      ref: 'APP-2',
      title: 'Fix login',
      priority: 'urgent',
      startDate: '2026-02-01',
      dueDate: '2026-02-10',
      updatedAt: '2026-02-02T00:00:00Z',
      stateId: 'state-done',
      stateName: 'Done',
      stateGroup: 'completed',
      assignees: [{ id: 'user-2', email: 'other@example.com', name: 'Other' }],
      labels: [{ id: 'label-2', name: 'Bug', color: '#f00' }],
      cycleId: 'cycle-2',
      moduleIds: ['module-2'],
    }),
    task({
      id: 'task-3',
      sequenceId: 3,
      ref: 'APP-3',
      title: 'Undated cleanup',
      priority: 'low',
      startDate: null,
      dueDate: null,
      updatedAt: null,
      stateId: 'state-backlog',
      stateName: 'Backlog',
      stateGroup: 'backlog',
      assignees: [],
      labels: [],
      cycleId: null,
      moduleIds: [],
    }),
  ];

  it('maps assignee me to the current email, case-insensitively', () => {
    const result = filterPlaneWorkItems(items, { assignee: 'me', limit: 10 }, 'lan@example.com');
    expect(result.items.map((item) => item.id)).toEqual(['task-1']);
    expect(result.total).toBe(1);
  });

  it('filters by state, state group, label, cycle, module, and priority', () => {
    expect(
      filterPlaneWorkItems(items, { state: 'missing', limit: 10 }, 'lan@example.com').items,
    ).toEqual([]);
    expect(
      filterPlaneWorkItems(items, { state: 'Done', limit: 10 }, '').items.map((item) => item.id),
    ).toEqual(['task-2']);
    expect(
      filterPlaneWorkItems(items, { stateGroup: 'completed', limit: 10 }, '').items.map(
        (item) => item.id,
      ),
    ).toEqual(['task-2']);
    expect(
      filterPlaneWorkItems(items, { label: 'docs', limit: 10 }, '').items.map((item) => item.id),
    ).toEqual(['task-1']);
    expect(
      filterPlaneWorkItems(items, { cycle: 'cycle-2', module: 'module-2', priority: 'urgent', limit: 10 }, '')
        .items.map((item) => item.id),
    ).toEqual(['task-2']);
  });

  it('applies inclusive date ranges and drops items with no date', () => {
    const result = filterPlaneWorkItems(
      items,
      { dueFrom: '2026-01-01', dueTo: '2026-01-31', limit: 10 },
      '',
    );
    expect(result.items.map((item) => item.id)).toEqual(['task-1']);
  });

  it('matches an exact work item id', () => {
    expect(
      filterPlaneWorkItems(items, { id: 'task-2', limit: 10 }, '').items.map((item) => item.id),
    ).toEqual(['task-2']);
  });

  it('searches title, ref, and label text', () => {
    expect(
      filterPlaneWorkItems(items, { search: 'app-2', limit: 10 }, '').items.map((item) => item.id),
    ).toEqual(['task-2']);
    expect(
      filterPlaneWorkItems(items, { search: 'bug', limit: 10 }, '').items.map((item) => item.id),
    ).toEqual(['task-2']);
  });

  it('sorts priority descending with urgent first and keeps null due dates last', () => {
    const byPriority = filterPlaneWorkItems(items, { sort: 'priority:desc', limit: 10 }, '');
    expect(byPriority.items.map((item) => item.priority)).toEqual(['urgent', 'medium', 'low']);

    const byDue = filterPlaneWorkItems(items, { sort: 'due:asc', limit: 10 }, '');
    expect(byDue.items.map((item) => item.id)).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('reports the full match count and applies the limit', () => {
    const result = filterPlaneWorkItems(items, { limit: 1, sort: 'sequence:asc' }, '');
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.id)).toEqual(['task-1']);
  });

  it('defaults the limit to 50', () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      task({ id: `task-${index}`, sequenceId: index, title: `Task ${index}` }),
    );
    const result = filterPlaneWorkItems(many, {}, '');
    expect(result.total).toBe(60);
    expect(result.items).toHaveLength(50);
  });
});
