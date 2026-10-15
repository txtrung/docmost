import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  getPlaneProjects,
  getPlaneRoadmap,
  PlaneGrouping,
  PlaneProject,
} from "@/features/editor/components/plane-task-list/plane-api";
import { insertPlaneRoadmap } from "./insert-plane-roadmap";

type PlaneRoadmapFormProps = {
  editor: Editor;
  insertAt: number;
  onClose: () => void;
};

export default function PlaneRoadmapForm({
  editor,
  insertAt,
  onClose,
}: PlaneRoadmapFormProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<PlaneProject[]>([]);
  const [configured, setConfigured] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<PlaneGrouping>("cycles");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        setError(getApiErrorMessage(err, t("Plane request failed.")));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function insert() {
    if (!projectId) return;
    setSaving(true);
    setError("");
    try {
      const result = await getPlaneRoadmap(projectId, grouping);
      if (!result.configured) {
        setConfigured(false);
        return;
      }
      if (!result.taskCount || !result.mermaid) {
        setError(t("No dated items to chart."));
        return;
      }
      insertPlaneRoadmap(editor, insertAt, result.mermaid);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, t("Plane request failed.")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm">
        {t(
          "Choose a Plane project and grouping. The chart is a snapshot. Use Regenerate on the diagram to refresh it.",
        )}
      </Text>
      {!configured && <Text size="sm">{t("Plane is not configured.")}</Text>}
      {configured && !loading && projects.length === 0 && !error && (
        <Text size="sm">{t("No Plane projects are visible for your account.")}</Text>
      )}
      <Select
        label={t("Project")}
        placeholder={t("Select a project")}
        data={projects.map((project) => ({
          value: project.id,
          label: project.identifier
            ? `${project.name} (${project.identifier})`
            : project.name,
        }))}
        value={projectId}
        onChange={(value) => setProjectId(value ? String(value) : null)}
        disabled={!configured || loading}
        searchable
        nothingFoundMessage={t("No projects")}
      />
      <Select
        label={t("Grouping")}
        value={grouping}
        onChange={(value) =>
          setGrouping((value as PlaneGrouping) || "cycles")
        }
        data={[
          { value: "cycles", label: t("Cycles") },
          { value: "modules", label: t("Modules") },
          { value: "workItems", label: t("Work items with dates") },
        ]}
        allowDeselect={false}
      />
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button onClick={() => void insert()} loading={saving} disabled={!projectId}>
          {t("Insert")}
        </Button>
      </Group>
    </Stack>
  );
}
