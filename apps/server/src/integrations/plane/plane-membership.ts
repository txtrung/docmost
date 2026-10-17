import { NormalizedPlaneTask } from './plane.types';

export type ModuleMembership = Record<string, string[]>;
export type CycleMembership = Record<string, string>;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function issueIdFromMembershipRow(row: unknown): string | null {
  const entry = record(row);
  if (!entry) return null;

  const issueText = text(entry.issue);
  if (issueText) return issueText;

  const issueId = text(record(entry.issue)?.id);
  if (issueId) return issueId;

  const detailId = text(record(entry.issue_detail)?.id);
  if (detailId) return detailId;

  const workItemText = text(entry.work_item);
  if (workItemText) return workItemText;

  const workItemId = text(record(entry.work_item)?.id) || text(entry.work_item_id);
  return workItemId || null;
}

export function attachMembership(
  tasks: NormalizedPlaneTask[],
  modules: ModuleMembership | null,
  cycles: CycleMembership | null,
): NormalizedPlaneTask[] {
  if (!modules && !cycles) return tasks;

  return tasks.map((task) => {
    const moduleIds =
      task.moduleIds.length > 0 ? task.moduleIds : (modules?.[task.id] ?? task.moduleIds);
    const cycleId = task.cycleId ?? (cycles ? (cycles[task.id] ?? null) : null);
    if (moduleIds === task.moduleIds && cycleId === task.cycleId) return task;
    return { ...task, moduleIds, cycleId };
  });
}
