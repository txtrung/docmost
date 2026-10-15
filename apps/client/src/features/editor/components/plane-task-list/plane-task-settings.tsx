import { useEffect, useState } from "react";
import {
  Checkbox,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  getPlaneCycles,
  getPlaneLabels,
  getPlaneMembers,
  getPlaneModules,
  getPlaneStates,
  PLANE_COLUMNS,
  PlaneCycle,
  PlaneLabel,
  PlaneModule,
  PlanePerson,
  PlaneProject,
  PlaneState,
  PlaneTaskFilters,
} from "./plane-api";

const COLUMN_LABEL: Record<(typeof PLANE_COLUMNS)[number], string> = {
  title: "Title",
  state: "State",
  assignees: "Assignees",
  priority: "Priority",
  due: "Due date",
  labels: "Labels",
};

export type PlaneTaskSettingsValue = {
  projectId: string;
  filters: PlaneTaskFilters;
  columns: string[];
  sort: string;
  limit: number;
};

type PlaneTaskSettingsProps = {
  projects: PlaneProject[];
  value: PlaneTaskSettingsValue;
  onChange: (value: PlaneTaskSettingsValue) => void;
};

const STATE_GROUPS = ["backlog", "unstarted", "started", "completed", "cancelled"];
const PRIORITIES = ["urgent", "high", "medium", "low", "none"];

function optionLabel(key: string, t: (value: string) => string) {
  const labels: Record<string, string> = {
    backlog: t("Backlog"),
    unstarted: t("Unstarted"),
    started: t("Started"),
    completed: t("Completed"),
    cancelled: t("Cancelled"),
    urgent: t("Urgent"),
    high: t("High"),
    medium: t("Medium"),
    low: t("Low"),
    none: t("None"),
    updated: t("Updated"),
    due: t("Due date"),
    start: t("Start date"),
    priority: t("Priority"),
    title: t("Title"),
    sequence: t("Sequence"),
  };
  return labels[key] ?? key;
}

export default function PlaneTaskSettings({
  projects,
  value,
  onChange,
}: PlaneTaskSettingsProps) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<{
    projectId: string;
    states: PlaneState[];
    labels: PlaneLabel[];
    cycles: PlaneCycle[];
    modules: PlaneModule[];
    members: PlanePerson[];
  } | null>(null);
  const [sortField, direction] = (value.sort || "updated:desc").split(":");
  const current = options?.projectId === value.projectId ? options : null;
  const states = current?.states ?? [];
  const labels = current?.labels ?? [];
  const cycles = current?.cycles ?? [];
  const modules = current?.modules ?? [];
  const members = current?.members ?? [];

  useEffect(() => {
    if (!value.projectId) return;
    let active = true;
    const projectId = value.projectId;
    Promise.all([
      getPlaneStates(projectId),
      getPlaneLabels(projectId),
      getPlaneCycles(projectId),
      getPlaneModules(projectId),
      getPlaneMembers(projectId),
    ])
      .then(([stateRes, labelRes, cycleRes, moduleRes, memberRes]) => {
        if (!active) return;
        setOptions({
          projectId,
          states: stateRes.items,
          labels: labelRes.items,
          cycles: cycleRes.items,
          modules: moduleRes.items,
          members: memberRes.items,
        });
      })
      .catch(() => {
        if (!active) return;
        setOptions({
          projectId,
          states: [],
          labels: [],
          cycles: [],
          modules: [],
          members: [],
        });
      });
    return () => {
      active = false;
    };
  }, [value.projectId]);

  function patch(next: Partial<PlaneTaskSettingsValue>) {
    onChange({ ...value, ...next });
  }

  function patchFilter(key: keyof PlaneTaskFilters, next: string | null) {
    const filters = { ...value.filters };
    if (!next) delete filters[key];
    else filters[key] = next;
    patch({ filters });
  }

  return (
    <Stack gap="xs">
      <Select
        label={t("Project")}
        placeholder={t("Select a project")}
        data={projects.map((project) => ({
          value: project.id,
          label: project.identifier
            ? `${project.name} (${project.identifier})`
            : project.name,
        }))}
        value={value.projectId || null}
        onChange={(projectId) =>
          patch({
            projectId: projectId || "",
            filters: {
              search: value.filters.search,
              priority: value.filters.priority,
              startFrom: value.filters.startFrom,
              startTo: value.filters.startTo,
              dueFrom: value.filters.dueFrom,
              dueTo: value.filters.dueTo,
            },
          })
        }
        searchable
        nothingFoundMessage={t("No projects")}
      />
      <Select
        label={t("State")}
        placeholder={t("All")}
        clearable
        data={states.map((state) => ({ value: state.id, label: state.name }))}
        value={value.filters.state ?? null}
        onChange={(next) => patchFilter("state", next)}
        disabled={!value.projectId}
      />
      <Select
        label={t("State group")}
        placeholder={t("All")}
        clearable
        data={STATE_GROUPS.map((group) => ({
          value: group,
          label: optionLabel(group, t),
        }))}
        value={value.filters.stateGroup ?? null}
        onChange={(next) => patchFilter("stateGroup", next)}
      />
      <Select
        label={t("Assignee")}
        placeholder={t("All")}
        clearable
        data={[
          { value: "me", label: t("Me") },
          ...members
            .filter((member) => member.email)
            .map((member) => ({
              value: member.email,
              label: member.name || member.email,
            })),
        ]}
        value={value.filters.assignee ?? null}
        onChange={(next) => patchFilter("assignee", next)}
        disabled={!value.projectId}
        searchable
      />
      <Select
        label={t("Label")}
        placeholder={t("All")}
        clearable
        data={labels.map((label) => ({ value: label.id, label: label.name }))}
        value={value.filters.label ?? null}
        onChange={(next) => patchFilter("label", next)}
        disabled={!value.projectId}
      />
      <Select
        label={t("Cycle")}
        placeholder={t("All")}
        clearable
        data={cycles.map((cycle) => ({ value: cycle.id, label: cycle.name }))}
        value={value.filters.cycle ?? null}
        onChange={(next) => patchFilter("cycle", next)}
        disabled={!value.projectId}
      />
      <Select
        label={t("Module")}
        placeholder={t("All")}
        clearable
        data={modules.map((moduleItem) => ({
          value: moduleItem.id,
          label: moduleItem.name,
        }))}
        value={value.filters.module ?? null}
        onChange={(next) => patchFilter("module", next)}
        disabled={!value.projectId}
      />
      <Select
        label={t("Priority")}
        placeholder={t("All")}
        clearable
        data={PRIORITIES.map((priority) => ({
          value: priority,
          label: optionLabel(priority, t),
        }))}
        value={value.filters.priority ?? null}
        onChange={(next) => patchFilter("priority", next)}
      />
      <TextInput
        label={t("Search")}
        value={value.filters.search ?? ""}
        onChange={(event) => patchFilter("search", event.currentTarget.value)}
      />
      <GroupDates
        fromLabel={t("Start from")}
        toLabel={t("Start to")}
        from={value.filters.startFrom ?? ""}
        to={value.filters.startTo ?? ""}
        onFrom={(next) => patchFilter("startFrom", next)}
        onTo={(next) => patchFilter("startTo", next)}
      />
      <GroupDates
        fromLabel={t("Due from")}
        toLabel={t("Due to")}
        from={value.filters.dueFrom ?? ""}
        to={value.filters.dueTo ?? ""}
        onFrom={(next) => patchFilter("dueFrom", next)}
        onTo={(next) => patchFilter("dueTo", next)}
      />
      <Select
        label={t("Sort")}
        data={["updated", "due", "start", "priority", "title", "sequence"].map(
          (field) => ({ value: field, label: optionLabel(field, t) }),
        )}
        value={sortField}
        onChange={(field) => patch({ sort: `${field || "updated"}:${direction || "desc"}` })}
        allowDeselect={false}
      />
      <Select
        label={t("Sort direction")}
        data={[
          { value: "asc", label: t("Ascending") },
          { value: "desc", label: t("Descending") },
        ]}
        value={direction === "asc" ? "asc" : "desc"}
        onChange={(next) => patch({ sort: `${sortField || "updated"}:${next || "desc"}` })}
        allowDeselect={false}
      />
      <NumberInput
        label={t("Limit")}
        min={1}
        max={100}
        value={value.limit}
        onChange={(next) => {
          const limit = typeof next === "number" ? next : Number(next);
          if (Number.isFinite(limit)) patch({ limit });
        }}
      />
      <Checkbox.Group
        label={t("Columns")}
        value={value.columns}
        onChange={(columns) => patch({ columns: columns.length ? columns : ["title"] })}
      >
        <Stack gap={4} mt={4}>
          {PLANE_COLUMNS.map((column) => (
            <Checkbox key={column} value={column} label={t(COLUMN_LABEL[column])} />
          ))}
        </Stack>
      </Checkbox.Group>
    </Stack>
  );
}

function GroupDates({
  fromLabel,
  toLabel,
  from,
  to,
  onFrom,
  onTo,
}: {
  fromLabel: string;
  toLabel: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <>
      <TextInput
        type="date"
        label={fromLabel}
        value={from}
        onChange={(event) => onFrom(event.currentTarget.value)}
      />
      <TextInput
        type="date"
        label={toLabel}
        value={to}
        onChange={(event) => onTo(event.currentTarget.value)}
      />
    </>
  );
}
