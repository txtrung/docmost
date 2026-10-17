import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewProps, NodeViewWrapper, useEditorState } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import {
  Box,
  Group,
  Popover,
  SegmentedControl,
  Select,
  Switch,
  Text,
  Title,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  HeadingLink,
  recalculateLinks,
} from "@/features/editor/components/table-of-contents/table-of-contents";
import linkClasses from "@/features/editor/components/table-of-contents/table-of-contents.module.css";
import classes from "./table-of-contents-block.module.css";

const LEVELS = ["1", "2", "3", "4", "5", "6"];

type TocStyle = "list" | "flat";

function levelAttr(value: unknown, fallback: number): number {
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 6) return fallback;
  return level;
}

function readRange(minRaw: unknown, maxRaw: unknown) {
  const minLevel = levelAttr(minRaw, 1);
  const maxLevel = Math.max(minLevel, levelAttr(maxRaw, 3));
  return { minLevel, maxLevel };
}

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
  const isEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isEditable,
  });
  const { minLevel, maxLevel } = readRange(node.attrs.minLevel, node.attrs.maxLevel);
  const style: TocStyle = node.attrs.style === "flat" ? "flat" : "list";
  const numbered = Boolean(node.attrs.numbered);
  const sticky = Boolean(node.attrs.sticky);
  const [links, setLinks] = useState<HeadingLink[]>([]);
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const headerPaddingRef = useRef<HTMLDivElement | null>(null);
  const visible = links.filter(
    (link) => link.level >= minLevel && link.level <= maxLevel,
  );
  const numbers = numbered ? headingNumbers(visible.map((link) => link.level)) : [];

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
    const nodes = visible.map((link) => link.element).filter(Boolean);
    if (!nodes.length) return;
    const headerOffset = headerOffsetPx(headerPaddingRef.current);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveElement(entry.target as HTMLElement);
        });
      },
      { rootMargin: `-${headerOffset}px 0px -85% 0px`, threshold: 0 },
    );
    nodes.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [links, minLevel, maxLevel]);

  function scrollToHeading(position: number) {
    if (editor.isDestroyed) return;
    editor.commands.showTabAt(position);
    const headerOffset = headerOffsetPx(headerPaddingRef.current);
    const { node: domNode } = editor.view.domAtPos(position);
    const element =
      domNode instanceof HTMLElement ? domNode : domNode.parentElement;
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    const tr = editor.view.state.tr;
    tr.setSelection(new TextSelection(tr.doc.resolve(position)));
    editor.view.dispatch(tr);
    editor.view.focus();
  }

  function write(patch: {
    minLevel?: number;
    maxLevel?: number;
    style?: TocStyle;
    numbered?: boolean;
    sticky?: boolean;
  }) {
    let nextMin = patch.minLevel ?? minLevel;
    let nextMax = patch.maxLevel ?? maxLevel;
    if (nextMin > nextMax) {
      if (patch.maxLevel !== undefined && patch.minLevel === undefined) nextMin = nextMax;
      else nextMax = nextMin;
    }
    updateAttributes({
      minLevel: nextMin,
      maxLevel: nextMax,
      style: patch.style ?? style,
      numbered: patch.numbered ?? numbered,
      sticky: patch.sticky ?? sticky,
    });
  }

  const outline = (
    <Outline
      links={visible}
      numbers={numbers}
      numbered={numbered}
      style={style}
      activeElement={activeElement}
      onJump={scrollToHeading}
      emptyLabel={t("Add headings (H1, H2, H3) to generate a table of contents.")}
    />
  );

  const floating =
    sticky && typeof document !== "undefined"
      ? createPortal(
          <div className={classes.stickyPanel} contentEditable={false}>
            <Title order={2} size="h6" fw={500} mb="xs">
              {t("Table of contents")}
            </Title>
            {outline}
          </div>,
          document.body,
        )
      : null;

  return (
    <NodeViewWrapper data-drag-handle className={classes.anchor}>
      <div contentEditable={false}>
        <Group justify="space-between" mb={sticky ? 0 : "xs"} wrap="nowrap">
          {!sticky && (
            <Title order={2} size="h6" fw={500}>
              {t("Table of contents")}
            </Title>
          )}
          {sticky && (
            <Text size="sm" c="dimmed">
              {t("Pinned table of contents")}
            </Text>
          )}
          {isEditable && (
            <TocSettings
              minLevel={minLevel}
              maxLevel={maxLevel}
              style={style}
              numbered={numbered}
              sticky={sticky}
              onChange={write}
            />
          )}
        </Group>
        {!sticky && outline}
        <div ref={headerPaddingRef} className={linkClasses.headerPadding} />
        {floating}
      </div>
    </NodeViewWrapper>
  );
}

function Outline({
  links,
  numbers,
  numbered,
  style,
  activeElement,
  onJump,
  emptyLabel,
}: {
  links: HeadingLink[];
  numbers: string[];
  numbered: boolean;
  style: TocStyle;
  activeElement: HTMLElement | null;
  onJump: (position: number) => void;
  emptyLabel: string;
}) {
  if (!links.length) return <Text size="sm">{emptyLabel}</Text>;

  if (style === "flat") {
    return (
      <div className={classes.flat}>
        {links.map((item, index) => (
          <button
            key={`${item.position}-${index}`}
            type="button"
            className={clsx(classes.flatLink, {
              [linkClasses.linkActive]: item.element === activeElement,
            })}
            onClick={() => onJump(item.position)}
          >
            {numbered ? `${numbers[index]} ${item.label}` : item.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={linkClasses.leftBorder}>
      {links.map((item, index) => (
        <Box<"button">
          component="button"
          key={`${item.position}-${index}`}
          onClick={() => onJump(item.position)}
          className={clsx(linkClasses.link, {
            [linkClasses.linkActive]: item.element === activeElement,
          })}
          style={{
            paddingLeft: `calc(${item.level} * var(--mantine-spacing-md))`,
          }}
        >
          {numbered ? `${numbers[index]} ${item.label}` : item.label}
        </Box>
      ))}
    </div>
  );
}

function TocSettings({
  minLevel,
  maxLevel,
  style,
  numbered,
  sticky,
  onChange,
}: {
  minLevel: number;
  maxLevel: number;
  style: TocStyle;
  numbered: boolean;
  sticky: boolean;
  onChange: (patch: {
    minLevel?: number;
    maxLevel?: number;
    style?: TocStyle;
    numbered?: boolean;
    sticky?: boolean;
  }) => void;
}) {
  const { t } = useTranslation();
  const levelData = LEVELS.map((level) => ({
    value: level,
    label: t("Heading {{level}}", { level }),
  }));

  return (
    <Popover position="bottom-end" width={280} shadow="md">
      <Popover.Target>
        <Tooltip label={t("Table of contents settings")}>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t("Table of contents settings")}
          >
            <IconSettings size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Select
          label={t("Minimum heading level")}
          data={levelData}
          value={String(minLevel)}
          onChange={(value) => onChange({ minLevel: levelAttr(value, minLevel) })}
          allowDeselect={false}
          mb="xs"
        />
        <Select
          label={t("Maximum heading level")}
          data={levelData}
          value={String(maxLevel)}
          onChange={(value) => onChange({ maxLevel: levelAttr(value, maxLevel) })}
          allowDeselect={false}
          mb="xs"
        />
        <Text size="sm" mb={4}>
          {t("Style")}
        </Text>
        <SegmentedControl
          fullWidth
          size="xs"
          mb="xs"
          value={style}
          onChange={(value) => onChange({ style: value === "flat" ? "flat" : "list" })}
          data={[
            { value: "list", label: t("List") },
            { value: "flat", label: t("Flat") },
          ]}
        />
        <Switch
          size="sm"
          mb="xs"
          label={t("Number headings")}
          checked={numbered}
          onChange={(event) => onChange({ numbered: event.currentTarget.checked })}
        />
        <Switch
          size="sm"
          label={t("Pin to the side")}
          checked={sticky}
          onChange={(event) => onChange({ sticky: event.currentTarget.checked })}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function headerOffsetPx(element: HTMLElement | null): number {
  if (!element) return 0;
  const parsed = parseInt(window.getComputedStyle(element).getPropertyValue("top"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
