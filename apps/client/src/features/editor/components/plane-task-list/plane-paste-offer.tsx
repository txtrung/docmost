import { useEffect, useState } from "react";
import { Button, Group, Loader, Stack, Text } from "@mantine/core";
import { Editor } from "@tiptap/core";
import { useTranslation } from "react-i18next";
import { parsePlaneUrl } from "./plane-api";

type Offer = {
  projectId: string;
  workItemId: string | null;
};

function insertLink(editor: Editor, url: string, pos: number) {
  editor
    .chain()
    .focus()
    .insertContentAt(pos, {
      type: "text",
      text: url,
      marks: [{ type: "link", attrs: { href: url } }],
    })
    .run();
}

export default function PlanePasteOffer({
  editor,
  url,
  pos,
  onClose,
}: {
  editor: Editor;
  url: string;
  pos: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    parsePlaneUrl(url)
      .then((result) => {
        if (!active) return;
        if (!result.configured || !result.projectId) {
          insertLink(editor, url, pos);
          onClose();
          return;
        }
        setOffer({ projectId: result.projectId, workItemId: result.workItemId });
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [editor, onClose, pos, url]);

  function insertTasks(card: boolean) {
    if (!offer) return;
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "planeTaskList",
        attrs: card
          ? {
              projectId: offer.projectId,
              filters: JSON.stringify({ id: offer.workItemId }),
              displayMode: "card",
              limit: 1,
            }
          : { projectId: offer.projectId },
      })
      .run();
    onClose();
  }

  if (failed) {
    return (
      <Stack gap="sm">
        <Text size="sm">{t("Plane request failed.")}</Text>
        <Button
          variant="default"
          onClick={() => {
            insertLink(editor, url, pos);
            onClose();
          }}
        >
          {t("Paste as link")}
        </Button>
      </Stack>
    );
  }

  if (!offer) return <Loader size="sm" />;

  return (
    <Stack gap="sm">
      <Text size="sm">{url}</Text>
      <Group>
        <Button onClick={() => insertTasks(false)}>{t("Insert as Plane tasks")}</Button>
        {offer.workItemId && (
          <Button variant="light" onClick={() => insertTasks(true)}>
            {t("Insert as a card")}
          </Button>
        )}
        <Button
          variant="default"
          onClick={() => {
            insertLink(editor, url, pos);
            onClose();
          }}
        >
          {t("Paste as link")}
        </Button>
      </Group>
    </Stack>
  );
}
