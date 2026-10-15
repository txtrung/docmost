import { useEffect, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper, useEditorState } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { Box, Group, Switch, Text, Title } from "@mantine/core";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  HeadingLink,
  recalculateLinks,
} from "@/features/editor/components/table-of-contents/table-of-contents";
import classes from "@/features/editor/components/table-of-contents/table-of-contents.module.css";

function headingNumbers(levels: number[]): string[] {
  if (!levels.length) return [];
  const min = Math.min(...levels);
  const counters: number[] = [];
  return levels.map((level) => {
    const depth = Math.max(0, level - min);
    counters[depth] = (counters[depth] ?? 0) + 1;
    counters.length = depth + 1;
    return counters.join(".");
  });
}

export default function TableOfContentsBlockView(props: NodeViewProps) {
  const { editor, node, updateAttributes } = props;
  const { t } = useTranslation();
  const numbered = Boolean(node.attrs.numbered);
  const isEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isEditable,
  });
  const [links, setLinks] = useState<HeadingLink[]>([]);
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const headerPaddingRef = useRef<HTMLDivElement | null>(null);
  const numbers = numbered ? headingNumbers(links.map((link) => link.level)) : [];

  useEffect(() => {
    const handleUpdate = () => {
      if (editor.isDestroyed) return;
      try {
        const headings = editor.$nodes("heading") ?? [];
        setLinks(recalculateLinks(headings).links);
      } catch {
        setLinks([]);
      }
    };
    handleUpdate();
    editor.on("update", handleUpdate);
    editor.on("create", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      editor.off("create", handleUpdate);
    };
  }, [editor]);

  useEffect(() => {
    const nodes = links.map((link) => link.element).filter(Boolean);
    if (!nodes.length) return;
    const headerOffset = headerOffsetPx(headerPaddingRef.current);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveElement(entry.target as HTMLElement);
          }
        });
      },
      { rootMargin: `-${headerOffset}px 0px -85% 0px`, threshold: 0 },
    );
    nodes.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [links]);

  function scrollToHeading(position: number) {
    if (editor.isDestroyed) return;
    editor.commands.showTabAt?.(position);
    const headerOffset = headerOffsetPx(headerPaddingRef.current);
    const { node: domNode } = editor.view.domAtPos(position);
    const element = (domNode instanceof HTMLElement
      ? domNode
      : domNode.parentElement) as HTMLElement | null;
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    const tr = editor.view.state.tr;
    tr.setSelection(new TextSelection(tr.doc.resolve(position)));
    editor.view.dispatch(tr);
    editor.view.focus();
  }

  return (
    <NodeViewWrapper data-drag-handle>
      <div contentEditable={false}>
        <Group justify="space-between" mb="xs">
          <Title order={2} size="h6" fw={500}>
            {t("Table of contents")}
          </Title>
          {isEditable && (
            <Switch
              size="xs"
              label={t("Number headings")}
              checked={numbered}
              onChange={(event) =>
                updateAttributes({ numbered: event.currentTarget.checked })
              }
            />
          )}
        </Group>
        {!links.length && (
          <Text size="sm">
            {t("Add headings (H1, H2, H3) to generate a table of contents.")}
          </Text>
        )}
        <div className={classes.leftBorder}>
          {links.map((item, index) => (
            <Box<"button">
              component="button"
              key={`${item.position}-${index}`}
              onClick={() => scrollToHeading(item.position)}
              className={clsx(classes.link, {
                [classes.linkActive]: item.element === activeElement,
              })}
              style={{
                paddingLeft: `calc(${item.level} * var(--mantine-spacing-md))`,
              }}
            >
              {numbered ? `${numbers[index]} ${item.label}` : item.label}
            </Box>
          ))}
        </div>
        <div ref={headerPaddingRef} className={classes.headerPadding} />
      </div>
    </NodeViewWrapper>
  );
}

function headerOffsetPx(element: HTMLElement | null): number {
  if (!element) return 0;
  const top = window.getComputedStyle(element).getPropertyValue("top");
  const parsed = parseInt(top, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
