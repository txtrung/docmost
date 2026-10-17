import api from "@/lib/api-client";
import type { RoadmapModel } from "@docmost/editor-ext";

export type PlaneProject = {
  id: string;
  name: string;
  identifier: string;
};

export type PlanePerson = {
  id: string;
  email: string;
  name: string;
};

export type PlaneLabel = {
  id: string;
  name: string;
  color: string;
};

export type PlaneState = {
  id: string;
  name: string;
  group: string;
  color: string;
};

export type PlaneCycle = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
};

export type PlaneModule = {
  id: string;
  name: string;
  startDate: string | null;
  targetDate: string | null;
};

export type PlaneTask = {
  id: string;
  sequenceId: number | null;
  ref: string | null;
  title: string;
  url: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  updatedAt: string | null;
  stateId: string | null;
  stateName: string | null;
  stateGroup: string | null;
  stateColor: string | null;
  assignees: PlanePerson[];
  labels: PlaneLabel[];
  cycleId: string | null;
  moduleIds: string[];
};

export type PlaneTaskFilters = {
  state?: string;
  stateGroup?: string;
  assignee?: string;
  label?: string;
  cycle?: string;
  module?: string;
  priority?: string;
  startFrom?: string;
  startTo?: string;
  dueFrom?: string;
  dueTo?: string;
  search?: string;
  id?: string;
};

export type PlaneGrouping = "cycles" | "modules" | "workItems";

type Configured<T> = { configured: boolean } & T;

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await api.post(path, body ?? {});
  return response.data as T;
}

export function getPlaneProjects() {
  return post<Configured<{ projects: PlaneProject[] }>>("/plane/projects");
}

export function getPlaneWorkItems(
  projectId: string,
  filters: PlaneTaskFilters & { sort?: string; limit?: number },
) {
  return post<Configured<{ items: PlaneTask[]; total: number }>>(
    "/plane/work-items",
    { projectId, filters },
  );
}

export function getPlaneStates(projectId: string) {
  return post<Configured<{ items: PlaneState[] }>>("/plane/states", { projectId });
}

export function getPlaneLabels(projectId: string) {
  return post<Configured<{ items: PlaneLabel[] }>>("/plane/labels", { projectId });
}

export function getPlaneCycles(projectId: string) {
  return post<Configured<{ items: PlaneCycle[] }>>("/plane/cycles", { projectId });
}

export function getPlaneModules(projectId: string) {
  return post<Configured<{ items: PlaneModule[] }>>("/plane/modules", { projectId });
}

export function getPlaneMembers(projectId: string) {
  return post<Configured<{ items: PlanePerson[] }>>("/plane/members", { projectId });
}

export function parsePlaneUrl(url: string) {
  return post<
    Configured<{ projectId: string | null; workItemId: string | null }>
  >("/plane/parse-url", { url });
}

export function getPlaneRoadmap(
  projectId: string,
  grouping: PlaneGrouping,
  current?: RoadmapModel,
) {
  return post<Configured<{ model: RoadmapModel | null }>>("/plane/roadmap", {
    projectId,
    grouping,
    current: current ? JSON.stringify(current) : undefined,
  });
}

export function parsePlaneFilters(raw: string): PlaneTaskFilters {
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as PlaneTaskFilters;
  } catch {
    return {};
  }
}

export const PLANE_COLUMNS = [
  "key",
  "title",
  "state",
  "assignees",
  "priority",
  "due",
  "labels",
] as const;

export function parsePlaneColumns(raw: string): string[] {
  try {
    const value = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [...PLANE_COLUMNS];
    const columns = value.filter(
      (item): item is string =>
        typeof item === "string" &&
        (PLANE_COLUMNS as readonly string[]).includes(item),
    );
    return columns.length ? columns : ["title"];
  } catch {
    return [...PLANE_COLUMNS];
  }
}
