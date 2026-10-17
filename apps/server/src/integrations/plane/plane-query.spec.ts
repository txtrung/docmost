import { parsePlaneQuery, projectClauseAllows, queryToFilters } from './plane-query';
import { filterPlaneWorkItems } from './plane-filters';
import { NormalizedPlaneTask } from './plane.types';

function task(overrides: Partial<NormalizedPlaneTask> = {}): NormalizedPlaneTask {
  return {
    id: 'task-1',
    sequenceId: 1,
    ref: 'APP-1',
    title: 'Write docs',
    url: 'https://plane.example/item',
    priority: 'high',
    startDate: '2026-01-05',
    dueDate: '2026-01-20',
    updatedAt: '2026-01-10T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    stateId: 'state-1',
    stateName: 'Done',
    stateGroup: 'completed',
    stateColor: '#000',
    assignees: [{ id: 'user-1', email: 'lan@example.com', name: 'Lan', avatarUrl: null }],
    labels: [],
    cycleId: null,
    moduleIds: [],
    ...overrides,
  };
}

describe('parsePlaneQuery', () => {
  it('maps the example query onto filters and sort', () => {
    const parsed = parsePlaneQuery(
      'project = APP AND state != Done AND assignee = currentUser() ORDER BY priority DESC',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sort).toBe('priority:desc');
    expect(projectClauseAllows(parsed.value.clauses, 'proj1', 'APP')).toBe(true);
    expect(projectClauseAllows(parsed.value.clauses, 'proj1', 'OTHER')).toBe(false);
    const filters = queryToFilters(parsed.value);
    const result = filterPlaneWorkItems(
      [
        task(),
        task({
          id: 'task-2',
          stateName: 'Started',
          priority: 'low',
          assignees: [{ id: 'user-1', email: 'lan@example.com', name: 'Lan', avatarUrl: null }],
        }),
      ],
      filters,
      'lan@example.com',
    );
    expect(result.items.map((item) => item.id)).toEqual(['task-2']);
  });

  it('accepts IN and a target date', () => {
    const parsed = parsePlaneQuery('priority IN (high, low) AND target = 2026-01-20');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = filterPlaneWorkItems([task()], queryToFilters(parsed.value), '');
    expect(result.total).toBe(1);
  });

  it('returns a clear error for a broken query', () => {
    expect(parsePlaneQuery('state !! Done').ok).toBe(false);
    const missing = parsePlaneQuery('state = Done AND');
    expect(missing).toEqual({ ok: false, error: 'Expected a field after AND.' });
    const date = parsePlaneQuery('updated = yesterday');
    expect(date.ok).toBe(false);
    if (date.ok === false) expect(date.error).toContain('YYYY-MM-DD');
  });
});
