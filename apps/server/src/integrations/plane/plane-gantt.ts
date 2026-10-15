import {
  NormalizedPlaneTask,
  PlaneCycle,
  PlaneGanttGrouping,
  PlaneModule,
} from './plane.types';

const DATE_RE = /^(\d{4}-\d{2}-\d{2})/;
const MARKER_RE =
  /^%% docmost-plane project=(\S+) grouping=(cycles|modules|workItems)\s*$/;

export function formatPlaneRoadmapMarker(
  projectId: string,
  grouping: PlaneGanttGrouping,
): string {
  return `%% docmost-plane project=${projectId} grouping=${grouping}`;
}

export function parsePlaneRoadmapMarker(source: string): {
  projectId: string;
  grouping: PlaneGanttGrouping;
} | null {
  const line = source.split(/\r?\n/, 1)[0] ?? '';
  const match = MARKER_RE.exec(line);
  if (!match) return null;
  return {
    projectId: match[1],
    grouping: match[2] as PlaneGanttGrouping,
  };
}

export function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = DATE_RE.exec(value.trim());
  return match ? match[1] : null;
}

export function escapeMermaidLabel(value: string): string {
  const cleaned = value
    .replace(/[\r\n]+/g, ' ')
    .replace(/[:#;]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Item';
}

export function exclusiveEnd(start: string, end: string): string {
  if (end > start) return end;
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export type PlaneGanttInput = {
  title: string;
  grouping: PlaneGanttGrouping;
  tasks: NormalizedPlaneTask[];
  cycles?: PlaneCycle[];
  modules?: PlaneModule[];
};

function taskLabel(task: NormalizedPlaneTask): string {
  return task.ref ? `${task.ref} ${task.title}` : task.title;
}

export function buildPlaneGantt(input: PlaneGanttInput): {
  mermaid: string;
  taskCount: number;
} {
  const lines = [
    'gantt',
    `    title ${escapeMermaidLabel(input.title || 'Plane')}`,
    '    dateFormat YYYY-MM-DD',
  ];
  let count = 0;
  let sequence = 0;
  const nextId = () => `t${++sequence}`;

  const addTask = (label: string, start: string | null, end: string | null) => {
    const startDate = isoDate(start);
    const endDate = isoDate(end);
    if (!startDate || !endDate) return;
    lines.push(
      `    ${escapeMermaidLabel(label)} :${nextId()}, ${startDate}, ${exclusiveEnd(startDate, endDate)}`,
    );
    count += 1;
  };

  const addSection = (name: string) => {
    lines.push(`    section ${escapeMermaidLabel(name)}`);
  };

  if (input.grouping === 'workItems') {
    addSection('Work items');
    for (const task of input.tasks) {
      addTask(taskLabel(task), task.startDate, task.dueDate);
    }
  } else if (input.grouping === 'cycles') {
    for (const cycle of input.cycles ?? []) {
      const tasks = input.tasks.filter(
        (task) =>
          task.cycleId === cycle.id &&
          isoDate(task.startDate) &&
          isoDate(task.dueDate),
      );
      const cycleStart = isoDate(cycle.startDate);
      const cycleEnd = isoDate(cycle.endDate);
      if (!tasks.length && !(cycleStart && cycleEnd)) continue;
      const name = cycle.name || 'Cycle';
      addSection(name);
      if (cycleStart && cycleEnd) addTask(name, cycleStart, cycleEnd);
      for (const task of tasks) {
        addTask(taskLabel(task), task.startDate, task.dueDate);
      }
    }
  } else {
    for (const moduleItem of input.modules ?? []) {
      const tasks = input.tasks.filter(
        (task) =>
          task.moduleIds.includes(moduleItem.id) &&
          isoDate(task.startDate) &&
          isoDate(task.dueDate),
      );
      const moduleStart = isoDate(moduleItem.startDate);
      const moduleEnd = isoDate(moduleItem.targetDate);
      if (!tasks.length && !(moduleStart && moduleEnd)) continue;
      const name = moduleItem.name || 'Module';
      addSection(name);
      if (moduleStart && moduleEnd) addTask(name, moduleStart, moduleEnd);
      for (const task of tasks) {
        addTask(taskLabel(task), task.startDate, task.dueDate);
      }
    }
  }

  if (count === 0) {
    return { mermaid: '', taskCount: 0 };
  }

  return { mermaid: lines.join('\n'), taskCount: count };
}
