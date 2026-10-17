import { useEffect, useState } from "react";
import { NodeViewProps, NodeViewWrapper, useEditorState } from "@tiptap/react";
import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconRefresh, IconSettings } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  createPlaneWorkItem,
  getPlaneMembers,
  getPlaneProjects,
  getPlaneStates,
  getPlaneWorkItems,
  parsePlaneColumns,
  parsePlaneFilters,
  PlanePerson,
  PlaneProject,
  PlaneState,
  PlaneTask,
} from "./plane-api";
import PlaneTaskSettings, {
  PlaneDisplayMode,
  PlaneTaskSettingsValue,
} from "./plane-task-settings";

const SORT_FIELD: Record<string, string> = {
  key: "sequence",
  title: "title",
  state: "state",
  assignees: "assignee",
  priority: "priority",
  due: "due",
  labels: "label",
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "red",
  high: "orange",
  medium: "yellow",
  low: "blue",
  none: "gray",
};

export default function PlaneTaskListView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const { t } = useTranslation();
  const isEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isEditable,
  });
  const projectId = String(node.attrs.projectId || "");
  const filters = parsePlaneFilters(String(node.attrs.filters || "{}"));
  const columns = parsePlaneColumns(String(node.attrs.columns || ""));
  const sort = String(node.attrs.sort || "updated:desc");
  const limit = Number(node.attrs.limit) || 50;
  const filterMode = node.attrs.filterMode === "query" ? "query" : "form";
  const query = String(node.attrs.query || "");
  const [viewerSort, setViewerSort] = useState<string | null>(null);
  const activeSort = !isEditable && viewerSort ? viewerSort : sort;
  const filterKey =
    filterMode === "query"
      ? `${projectId}|query|${query}|${limit}`
      : `${projectId}|${node.attrs.filters}|${activeSort}|${limit}`;
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const page = pageState.filterKey === filterKey ? pageState.page : 1;
  const pageId = String((editor.storage as { pageId?: string }).pageId || "");
  const displayMode: PlaneDisplayMode =
    node.attrs.displayMode === "card" || node.attrs.displayMode === "count"
      ? node.attrs.displayMode
      : "table";

  const [projects, setProjects] = useState<PlaneProject[]>([]);
  const [configured, setConfigured] = useState(true);
  const [items, setItems] = useState<PlaneTask[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(!projectId && isEditable);
  const [refreshToken, setRefreshToken] = useState(0);
  const [updatedAt, setUpdatedAt] = useState("");
  const requestKey = `${filterKey}|${page}|${refreshToken}`;
  const visibleItems = loadedKey === requestKey ? items : [];
  const showLoading = Boolean(projectId) && (loading || loadedKey !== requestKey);

  useEffect(() => {
    let active = true;
    getPlaneProjects()
      .then((result) => {
        if (!active) return;
        setConfigured(result.configured);
        setProjects(result.projects);
      })
      .catch((err) => {
        if (!active) return;
        setError(getApiErrorMessage(err, t("Failed to load Plane tasks.")));
      });
    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      getPlaneWorkItems(
        projectId,
        filterMode === "query"
          ? { query, page, limit }
          : { ...filters, sort: activeSort, limit, page },
      )
        .then((result) => {
          if (!active) return;
          setConfigured(result.configured);
          setItems(result.items);
          setTotal(result.total);
          setLoadedKey(requestKey);
          setUpdatedAt(
            new Date().toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
          setError("");
        })
        .catch((err) => {
          if (!active) return;
          setItems([]);
          setLoadedKey(requestKey);
          setError(getApiErrorMessage(err, t("Failed to load Plane tasks.")));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [projectId, node.attrs.filters, filterMode, query, activeSort, limit, page, refreshToken, requestKey, t]);

  function toggleSort(column: string) {
    const field = SORT_FIELD[column];
    if (!field) return;
    const [current, direction] = activeSort.split(":");
    const nextDirection = current === field && direction !== "asc" ? "asc" : "desc";
    const next = `${field}:${nextDirection}`;
    if (isEditable) updateAttributes({ sort: next });
    else setViewerSort(next);
  }

  function applySettings(next: PlaneTaskSettingsValue) {
    updateAttributes({
      projectId: next.projectId,
      filters: JSON.stringify(next.filters),
      columns: JSON.stringify(next.columns),
      sort: next.sort,
      limit: next.displayMode === "card" ? 1 : next.limit,
      displayMode: next.displayMode,
      filterMode: next.filterMode,
      query: next.query,
    });
  }

  const projectName =
    projects.find((project) => project.id === projectId)?.name || t("Plane tasks");

  return (
    <NodeViewWrapper data-drag-handle>
      <Paper withBorder radius="md" p="sm" contentEditable={false}>
        <Group justify="space-between" mb="xs" wrap="nowrap">
          <Text fw={600} size="sm">
            {projectName}
          </Text>
          <Group gap={4} wrap="nowrap">
            {isEditable && projectId && (
              <CreateWorkItemButton
                projectId={projectId}
                pageId={pageId}
                onCreated={() => setRefreshToken((token) => token + 1)}
              />
            )}
            <Tooltip label={t("Refresh")}>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={t("Refresh")}
                onClick={() => setRefreshToken((token) => token + 1)}
                disabled={!projectId}
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
            {isEditable && (
              <>
                <Tooltip label={t("Plane tasks settings")}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t("Plane tasks settings")}
                    onClick={() => setSettingsOpen(true)}
                  >
                    <IconSettings size={16} />
                  </ActionIcon>
                </Tooltip>
                <Modal
                  opened={settingsOpen}
                  onClose={() => setSettingsOpen(false)}
                  title={t("Plane tasks settings")}
                  size="lg"
                >
                  <ScrollArea.Autosize mah={520} type="auto">
                    <PlaneTaskSettings
                      projects={projects}
                      value={{
                        projectId,
                        filters,
                        columns,
                        sort,
                        limit,
                        displayMode,
                        filterMode,
                        query,
                      }}
                      onChange={applySettings}
                    />
                  </ScrollArea.Autosize>
                </Modal>
              </>
            )}
          </Group>
        </Group>

        {!configured && <Text size="sm">{t("Plane is not configured.")}</Text>}
        {configured && error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        {configured && !error && !projectId && (
          <Text size="sm">{t("Select a project")}</Text>
        )}
        {showLoading && <Loader size="sm" mt="xs" />}
        {displayMode !== "count" &&
          configured &&
          !error &&
          projectId &&
          !showLoading &&
          visibleItems.length === 0 && (
          <Text size="sm">{t("No work items match these filters.")}</Text>
        )}
        {displayMode === "count" && !showLoading && projectId && !error && configured && (
          <Title order={2}>{total}</Title>
        )}
        {displayMode === "card" && visibleItems[0] && (
          <TaskCard item={visibleItems[0]} t={t} />
        )}
        {displayMode === "table" && visibleItems.length > 0 && (
          <Table striped highlightOnHover withTableBorder verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                {columns.map((column) => (
                  <Table.Th key={column}>
                    <button
                      type="button"
                      aria-label={t("Sort")}
                      onClick={() => toggleSort(column)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        font: "inherit",
                        cursor: isEditable ? "pointer" : "default",
                      }}
                    >
                      {t(columnHeader(column))}
                      {activeSort.startsWith(`${SORT_FIELD[column]}:`)
                        ? activeSort.endsWith(":asc")
                          ? " ↑"
                          : " ↓"
                        : ""}
                    </button>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleItems.map((item) => (
                <Table.Tr key={item.id}>
                  {columns.map((column) => (
                    <Table.Td key={column}>{renderCell(column, item, t)}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {displayMode === "table" && total > limit && !showLoading && (
          <Group gap="xs" mt="xs">
            <Button
              size="compact-xs"
              variant="default"
              disabled={page <= 1}
              onClick={() => setPageState({ filterKey, page: page - 1 })}
            >
              {t("Previous")}
            </Button>
            <Text size="xs">{t("Page {{page}}", { page })}</Text>
            <Button
              size="compact-xs"
              variant="default"
              disabled={page * limit >= total}
              onClick={() => setPageState({ filterKey, page: page + 1 })}
            >
              {t("Next")}
            </Button>
          </Group>
        )}
        {projectId && !showLoading && !error && configured && updatedAt && (
          <Text size="xs" c="dimmed" mt="xs">
            {t("{{total}} items, updated at {{time}}", {
              total,
              time: updatedAt,
            })}
          </Text>
        )}
      </Paper>
    </NodeViewWrapper>
  );
}

function columnHeader(column: string): string {
  switch (column) {
    case "title":
      return "Title";
    case "key":
      return "Key";
    case "state":
      return "State";
    case "assignees":
      return "Assignees";
    case "priority":
      return "Priority";
    case "due":
      return "Due date";
    case "labels":
      return "Labels";
    default:
      return column;
  }
}

function renderCell(
  column: string,
  item: PlaneTask,
  t: (key: string) => string,
) {
  switch (column) {
    case "key":
      return item.ref || "—";
    case "title":
      return (
        <Anchor href={item.url} target="_blank" rel="noopener noreferrer">
          {item.ref ? `${item.ref} ${item.title}` : item.title}
        </Anchor>
      );
    case "state":
      return item.stateName ? (
        <Badge variant="light" color="gray">
          {item.stateName}
        </Badge>
      ) : (
        "—"
      );
    case "assignees":
      return item.assignees.length ? (
        <Group gap={6} wrap="nowrap">
          {item.assignees.map((person) => (
            <PersonFace key={person.id || person.email} person={person} />
          ))}
        </Group>
      ) : (
        "—"
      );
    case "priority":
      return (
        <Badge variant="light" color={PRIORITY_COLOR[item.priority] || "gray"}>
          {t(priorityLabel(item.priority))}
        </Badge>
      );
    case "due":
      return item.dueDate || "—";
    case "labels":
      return item.labels.length
        ? item.labels.map((label) => (
            <Badge key={label.id} variant="outline" mr={4} color="gray">
              {label.name}
            </Badge>
          ))
        : "—";
    default:
      return null;
  }
}

function TaskCard({
  item,
  t,
}: {
  item: PlaneTask;
  t: (key: string) => string;
}) {
  const person = item.assignees[0];
  return (
    <Group wrap="nowrap" gap="sm">
      <Text fw={700} size="sm">
        {item.ref || "—"}
      </Text>
      <Anchor href={item.url} target="_blank" rel="noopener noreferrer">
        {item.title}
      </Anchor>
      {item.stateName && (
        <Badge variant="light" color="gray">
          {item.stateName}
        </Badge>
      )}
      {person && <PersonFace person={person} />}
      <Badge variant="light" color={PRIORITY_COLOR[item.priority] || "gray"}>
        {t(priorityLabel(item.priority))}
      </Badge>
    </Group>
  );
}

function PersonFace({ person }: { person: PlanePerson }) {
  const initials = (person.name || person.email || "?").slice(0, 1).toUpperCase();
  return (
    <Group gap={6} wrap="nowrap">
      <Avatar size="sm" radius="xl" color="blue" src={person.avatarUrl || undefined}>
        {initials}
      </Avatar>
      <Text size="sm">{person.name || person.email}</Text>
    </Group>
  );
}

function CreateWorkItemButton({
  projectId,
  pageId,
  onCreated,
}: {
  projectId: string;
  pageId: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [title, setTitle] = useState("");
  const [stateId, setStateId] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [states, setStates] = useState<PlaneState[]>([]);
  const [members, setMembers] = useState<PlanePerson[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!opened) return;
    let active = true;
    Promise.all([getPlaneStates(projectId), getPlaneMembers(projectId)])
      .then(([stateRes, memberRes]) => {
        if (!active) return;
        setStates(stateRes.items);
        setMembers(memberRes.items);
      })
      .catch(() => {
        if (!active) return;
        setStates([]);
        setMembers([]);
      });
    return () => {
      active = false;
    };
  }, [opened, projectId]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed || !pageId) {
      setError(t("Title is required."));
      return;
    }
    setSaving(true);
    createPlaneWorkItem({
      pageId,
      projectId,
      title: trimmed,
      stateId: stateId || undefined,
      priority: priority || undefined,
      assigneeId: assigneeId || undefined,
    })
      .then(() => {
        setOpened(false);
        setTitle("");
        setStateId(null);
        setPriority(null);
        setAssigneeId(null);
        setError("");
        onCreated();
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, t("Plane request failed.")));
      })
      .finally(() => setSaving(false));
  }

  return (
    <>
      <Tooltip label={t("Create work item")}>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t("Create work item")}
          onClick={() => setOpened(true)}
          disabled={!pageId}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Tooltip>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={t("Create work item")}
      >
        <Stack gap="xs">
          <TextInput
            label={t("Title")}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <Select
            label={t("State")}
            data={states.map((state) => ({ value: state.id, label: state.name }))}
            value={stateId}
            onChange={(value) => setStateId(value ? String(value) : null)}
            clearable
          />
          <Select
            label={t("Priority")}
            data={[
              { value: "urgent", label: t("Urgent") },
              { value: "high", label: t("High") },
              { value: "medium", label: t("Medium") },
              { value: "low", label: t("Low") },
              { value: "none", label: t("None") },
            ]}
            value={priority}
            onChange={(value) => setPriority(value ? String(value) : null)}
            clearable
          />
          <Select
            label={t("Assignee")}
            data={members.map((member) => ({
              value: member.id,
              label: member.name || member.email,
            }))}
            value={assigneeId}
            onChange={(value) => setAssigneeId(value ? String(value) : null)}
            clearable
          />
          {error && (
            <Text size="sm" c="red">
              {error}
            </Text>
          )}
          <Button loading={saving} onClick={submit}>
            {t("Create")}
          </Button>
        </Stack>
      </Modal>
    </>
  );
}

function priorityLabel(priority: string): string {
  switch (priority) {
    case "urgent":
      return "Urgent";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return "None";
  }
}
