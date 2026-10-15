import { useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import { getPlaneRoadmap } from "@/features/editor/components/plane-task-list/plane-api";
import { notifications } from "@mantine/notifications";
import { parsePlaneRoadmapMarker } from "./plane-roadmap-marker";

export default function PlaneRoadmapRegenerateButton({
  node,
  editor,
  getPos,
}: Pick<NodeViewProps, "node" | "editor" | "getPos">) {
  const { t } = useTranslation();
  const marker = parsePlaneRoadmapMarker(node.textContent);
  const [loading, setLoading] = useState(false);

  if (!marker || !editor.isEditable) return null;

  async function regenerate() {
    if (!marker) return;
    setLoading(true);
    try {
      const result = await getPlaneRoadmap(marker.projectId, marker.grouping);
      if (!result.configured) {
        notifications.show({ message: t("Plane is not configured."), color: "yellow" });
        return;
      }
      if (!result.mermaid) {
        notifications.show({ message: t("No dated items to chart."), color: "yellow" });
        return;
      }
      const pos = getPos();
      if (typeof pos !== "number") return;
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.insertText(result.mermaid, from, to);
          return true;
        })
        .run();
    } catch (err) {
      notifications.show({
        message: getApiErrorMessage(err, t("Plane request failed.")),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tooltip label={t("Regenerate Plane roadmap")} withArrow position="right">
      <ActionIcon
        variant="subtle"
        color="gray"
        loading={loading}
        onClick={() => void regenerate()}
        aria-label={t("Regenerate Plane roadmap")}
      >
        <IconRefresh size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
