import { NormalizedPlaneTask, PlaneFilterInput } from './plane.types';

const STRING_FIELDS = [
  'state',
  'stateGroup',
  'assignee',
  'label',
  'cycle',
  'module',
  'priority',
  'startFrom',
  'startTo',
  'dueFrom',
  'dueTo',
  'search',
  'sort',
] as const;

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function sanitizePlaneFilters(input: unknown): PlaneFilterInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const source = input as Record<string, unknown>;
  const filters: PlaneFilterInput = {};

  for (const field of STRING_FIELDS) {
    const value = source[field];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    filters[field] = trimmed.slice(0, 200);
  }

  const limit = source.limit;
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    filters.limit = Math.trunc(limit);
  } else if (typeof limit === 'string' && /^\d+$/.test(limit.trim())) {
    filters.limit = Number(limit.trim());
  }

  return filters;
}

function same(value: string | null | undefined, expected: string): boolean {
  return (value ?? '').toLowerCase() === expected.toLowerCase();
}

function dateBound(value: string | undefined): string | undefined {
  if (!value || !DATE_RE.test(value)) return undefined;
  return value;
}

function inRange(
  value: string | null,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function matchesAssignee(
  item: NormalizedPlaneTask,
  assignee: string,
  currentEmail: string,
): boolean {
  if (assignee.toLowerCase() === 'me') {
    const email = currentEmail.trim().toLowerCase();
    if (!email) return false;
    return item.assignees.some(
      (person) => person.email.trim().toLowerCase() === email,
    );
  }

  return item.assignees.some(
    (person) => same(person.email, assignee) || same(person.id, assignee),
  );
}

function matches(item: NormalizedPlaneTask, filters: PlaneFilterInput, email: string): boolean {
  if (filters.state && !same(item.stateId, filters.state) && !same(item.stateName, filters.state)) {
    return false;
  }
  if (filters.stateGroup && !same(item.stateGroup, filters.stateGroup)) {
    return false;
  }
  if (filters.assignee && !matchesAssignee(item, filters.assignee, email)) {
    return false;
  }
  if (
    filters.label &&
    !item.labels.some(
      (label) => same(label.id, filters.label) || same(label.name, filters.label),
    )
  ) {
    return false;
  }
  if (filters.cycle && !same(item.cycleId, filters.cycle)) {
    return false;
  }
  if (
    filters.module &&
    !item.moduleIds.some((moduleId) => same(moduleId, filters.module))
  ) {
    return false;
  }
  if (filters.priority && !same(item.priority, filters.priority)) {
    return false;
  }
  if (
    !inRange(item.startDate, dateBound(filters.startFrom), dateBound(filters.startTo))
  ) {
    return false;
  }
  if (!inRange(item.dueDate, dateBound(filters.dueFrom), dateBound(filters.dueTo))) {
    return false;
  }

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = [
      item.title,
      item.ref ?? '',
      item.sequenceId?.toString() ?? '',
      item.stateName ?? '',
      ...item.labels.map((label) => label.name),
      ...item.assignees.map((person) => `${person.name} ${person.email}`),
    ]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

function isNullish(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

function compareValues(
  left: string | number | null,
  right: string | number | null,
  desc: boolean,
): number {
  const leftMissing = isNullish(left);
  const rightMissing = isNullish(right);
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }
  if (left! < right!) return desc ? 1 : -1;
  if (left! > right!) return desc ? -1 : 1;
  return 0;
}

function compareTasks(
  left: NormalizedPlaneTask,
  right: NormalizedPlaneTask,
  sort: string | undefined,
): number {
  if (!sort) return 0;
  const [field, direction] = sort.split(':');
  const desc = direction !== 'asc';

  switch (field) {
    case 'title':
      return compareValues(left.title.toLowerCase(), right.title.toLowerCase(), desc);
    case 'due':
      return compareValues(left.dueDate, right.dueDate, desc);
    case 'start':
      return compareValues(left.startDate, right.startDate, desc);
    case 'updated':
      return compareValues(left.updatedAt, right.updatedAt, desc);
    case 'sequence':
      return compareValues(left.sequenceId, right.sequenceId, desc);
    case 'priority': {
      const leftRank = PRIORITY_RANK[left.priority.toLowerCase()] ?? 5;
      const rightRank = PRIORITY_RANK[right.priority.toLowerCase()] ?? 5;
      // Rank 0 is urgent. Descending priority lists urgent first.
      return compareValues(rightRank, leftRank, desc);
    }
    default:
      return 0;
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.trunc(limit), MAX_LIMIT);
}

export function filterPlaneWorkItems(
  items: NormalizedPlaneTask[],
  filters: PlaneFilterInput,
  currentEmail: string,
): { items: NormalizedPlaneTask[]; total: number } {
  const matched = items.filter((item) => matches(item, filters, currentEmail));
  const sorted = filters.sort
    ? matched
        .map((item, index) => ({ item, index }))
        .sort((left, right) => {
          const result = compareTasks(left.item, right.item, filters.sort);
          return result || left.index - right.index;
        })
        .map((entry) => entry.item)
    : matched;

  const limit = clampLimit(filters.limit);
  return {
    items: sorted.slice(0, limit),
    total: sorted.length,
  };
}
