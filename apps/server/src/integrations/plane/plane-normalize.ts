import {
  NormalizedPlaneTask,
  PlaneCycle,
  PlaneLabel,
  PlaneModule,
  PlanePerson,
  PlaneProject,
  PlaneState,
} from './plane.types';
import { isoDate } from './plane-gantt';

function asRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function planeIssueUrl(
  origin: string,
  workspace: string,
  projectId: string,
  issueId: string,
): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/${workspace}/projects/${projectId}/issues/${issueId}`;
}

export function normalizePerson(value: unknown): PlanePerson | null {
  if (typeof value === 'string' && value.trim()) {
    return { id: value.trim(), email: '', name: value.trim() };
  }
  const record = asRecord(value);
  if (!record) return null;
  const nested = asRecord(record.member) ?? asRecord(record.user) ?? record;
  const email = text(nested.email);
  const id = text(nested.id) || text(record.id);
  const name =
    text(nested.display_name) ||
    [text(nested.first_name), text(nested.last_name)].filter(Boolean).join(' ') ||
    email ||
    id;
  if (!id && !email) return null;
  return { id, email, name };
}

function normalizeLabel(value: unknown): { id: string; name: string; color: string } | null {
  if (typeof value === 'string' && value.trim()) {
    return { id: value.trim(), name: '', color: '' };
  }
  const record = asRecord(value);
  if (!record) return null;
  const id = text(record.id);
  if (!id) return null;
  return { id, name: text(record.name), color: text(record.color) };
}

function idList(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      const record = asRecord(item);
      return record ? text(record.id) : '';
    })
    .filter(Boolean);
}

export function normalizeProject(value: unknown): PlaneProject | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = text(record.id);
  if (!id) return null;
  return {
    id,
    name: text(record.name) || id,
    identifier: text(record.identifier),
  };
}

export function normalizeWorkItem(
  value: unknown,
  context: {
    origin: string;
    workspace: string;
    projectId: string;
    projectIdentifier?: string;
  },
): NormalizedPlaneTask | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = text(record.id);
  if (!id) return null;

  const sequenceRaw = record.sequence_id;
  const sequenceId =
    typeof sequenceRaw === 'number'
      ? sequenceRaw
      : typeof sequenceRaw === 'string' && /^\d+$/.test(sequenceRaw)
        ? Number(sequenceRaw)
        : null;
  const identifier = context.projectIdentifier || '';
  const ref =
    identifier && sequenceId !== null
      ? `${identifier}-${sequenceId}`
      : sequenceId !== null
        ? `#${sequenceId}`
        : null;

  const state = record.state;
  const stateRecord = asRecord(state);
  const stateId = stateRecord ? text(stateRecord.id) : text(state);
  const assignees = asArray(record.assignees)
    .map(normalizePerson)
    .filter((person): person is PlanePerson => Boolean(person));
  const labels = asArray(record.labels)
    .map(normalizeLabel)
    .filter((label): label is { id: string; name: string; color: string } =>
      Boolean(label),
    );

  const cycleRecord = asRecord(record.cycle);
  const cycleId = cycleRecord ? text(cycleRecord.id) : text(record.cycle_id);
  const moduleIds = [
    ...idList(record.module_ids),
    ...idList(record.modules),
  ].filter((moduleId, index, all) => all.indexOf(moduleId) === index);

  return {
    id,
    sequenceId,
    ref,
    title: text(record.name) || text(record.title) || id,
    url: planeIssueUrl(context.origin, context.workspace, context.projectId, id),
    priority: (text(record.priority) || 'none').toLowerCase(),
    startDate: isoDate(text(record.start_date)),
    dueDate: isoDate(text(record.target_date)),
    updatedAt: text(record.updated_at) || null,
    stateId: stateId || null,
    stateName: stateRecord ? text(stateRecord.name) || null : null,
    stateGroup: stateRecord ? text(stateRecord.group) || null : null,
    stateColor: stateRecord ? text(stateRecord.color) || null : null,
    assignees,
    labels,
    cycleId: cycleId || null,
    moduleIds,
  };
}

export function normalizeCycle(value: unknown): PlaneCycle | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = text(record.id);
  if (!id) return null;
  return {
    id,
    name: text(record.name) || id,
    startDate: isoDate(text(record.start_date)),
    endDate: isoDate(text(record.end_date)),
  };
}

export function normalizeModule(value: unknown): PlaneModule | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = text(record.id);
  if (!id) return null;
  return {
    id,
    name: text(record.name) || id,
    startDate: isoDate(text(record.start_date)),
    targetDate: isoDate(text(record.target_date)),
  };
}

export function normalizeState(value: unknown): PlaneState | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = text(record.id);
  if (!id) return null;
  return {
    id,
    name: text(record.name) || id,
    group: text(record.group),
    color: text(record.color),
  };
}

export function normalizeLabelRecord(value: unknown): PlaneLabel | null {
  const label = normalizeLabel(value);
  if (!label || !label.name) {
    if (!label?.id) return null;
    return { id: label.id, name: label.id, color: label?.color ?? '' };
  }
  return label;
}
