export type PlanePriority = 'urgent' | 'high' | 'medium' | 'low' | 'none' | string;

export type PlanePerson = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export type PlaneLabelRef = {
  id: string;
  name: string;
  color: string;
};

export type NormalizedPlaneTask = {
  id: string;
  sequenceId: number | null;
  ref: string | null;
  title: string;
  url: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  stateId: string | null;
  stateName: string | null;
  stateGroup: string | null;
  stateColor: string | null;
  assignees: PlanePerson[];
  labels: PlaneLabelRef[];
  cycleId: string | null;
  moduleIds: string[];
};

export type PlaneProject = {
  id: string;
  name: string;
  identifier: string;
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

export type PlaneState = {
  id: string;
  name: string;
  group: string;
  color: string;
};

export type PlaneLabel = {
  id: string;
  name: string;
  color: string;
};

export type PlaneFilterInput = {
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
  sort?: string;
  limit?: number;
  page?: number;
  clauses?: PlaneClause[];
};

export type PlaneClause = {
  field: string;
  op: 'eq' | 'neq' | 'in';
  values: string[];
};

export type PlaneRoadmapGrouping = 'cycles' | 'modules' | 'workItems';
