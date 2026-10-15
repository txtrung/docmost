import { useEffect, useState } from "react";
import { NodeViewProps, NodeViewWrapper, useEditorState } from "@tiptap/react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Loader,
  Paper,
  Popover,
  ScrollArea,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconRefresh, IconSettings } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  getPlaneProjects,
  getPlaneWorkItems,
  parsePlaneColumns,
  parsePlaneFilters,
  PlaneProject,
  PlaneTask,
} from "./plane-api";
import PlaneTaskSettings, { PlaneTaskSettingsValue } from "./plane-task-settings";

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

  const [projects, setProjects] = useState<PlaneProject[]>([]);
  const [configured, setConfigured] = useState(true);
  const [items, setItems] = useState<PlaneTask[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(!projectId && isEditable);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestKey = `${projectId}|${node.attrs.filters}|${sort}|${limit}|${refreshToken}`;
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
      getPlaneWorkItems(projectId, { ...filters, sort, limit })
        .then((result) => {
          if (!active) return;
          setConfigured(result.configured);
          setItems(result.items);
          setTotal(result.total);
          setLoadedKey(requestKey);
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
  }, [projectId, node.attrs.filters, sort, limit, refreshToken, requestKey, t]);

  function applySettings(next: PlaneTaskSettingsValue) {
    updateAttributes({
      projectId: next.projectId,
      filters: JSON.stringify(next.filters),
      columns: JSON.stringify(next.columns),
      sort: next.sort,
      limit: next.limit,
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
              <Popover
                opened={settingsOpen}
                onChange={setSettingsOpen}
                position="bottom-end"
                width={320}
                shadow="md"
              >
                <Popover.Target>
                  <Tooltip label={t("Plane tasks settings")}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t("Plane tasks settings")}
                      onClick={() => setSettingsOpen((open) => !open)}
                    >
                      <IconSettings size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Popover.Target>
                <Popover.Dropdown>
                  <ScrollArea.Autosize mah={420} type="auto">
                    <PlaneTaskSettings
                      projects={projects}
                      value={{ projectId, filters, columns, sort, limit }}
                      onChange={applySettings}
                    />
                  </ScrollArea.Autosize>
                </Popover.Dropdown>
              </Popover>
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
        {configured && !error && projectId && !showLoading && visibleItems.length === 0 && (
          <Text size="sm">{t("No work items match these filters.")}</Text>
        )}
        {visibleItems.length > 0 && (
          <Table striped highlightOnHover withTableBorder verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                {columns.map((column) => (
                  <Table.Th key={column}>{t(columnHeader(column))}</Table.Th>
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
        {projectId && total > visibleItems.length && visibleItems.length > 0 && (
          <Text size="xs" c="dimmed" mt="xs">
            {t("Showing {{shown}} of {{total}}", {
              shown: visibleItems.length,
              total,
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
      return item.assignees.map((person) => person.name || person.email).join(", ") || "—";
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
