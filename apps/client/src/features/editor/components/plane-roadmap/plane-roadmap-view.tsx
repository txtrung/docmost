import { useEffect, useId, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper, useEditorState } from "@tiptap/react";
import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Popover,
  SegmentedControl,
  Select,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconDownload, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  ROADMAP_COLORS,
  addDays,
  addLane,
  addManualBar,
  daysBetween,
  emptyRoadmap,
  parseRoadmapModel,
  packRoadmapRows,
  removeBar,
  removeLane,
  roadmapDayWidth,
  setZoom,
  updateBar,
  updateLane,
  zoomForSpan,
  zoomForWidth,
  type RoadmapBar,
  type RoadmapGrouping,
  type RoadmapLane,
  type RoadmapModel,
  type RoadmapZoom,
} from "@docmost/editor-ext";
import { getApiErrorMessage } from "@/lib/api-error";
import { getPlaneProjects, getPlaneRoadmap, PlaneProject } from "../plane-task-list/plane-api";
import { migrateRoadmap, readSharedRoadmap, roadmapMap, writeChangedRoadmap } from "./roadmap-y";
import classes from "./plane-roadmap.module.css";

type DragEdge = "move" | "start" | "end";

type DragState = {
  id: string;
  originX: number;
  start: string;
  end: string;
  nextStart: string;
  nextEnd: string;
  edge: DragEdge;
  moved: boolean;
};

function readModel(raw: string, projectId: string, grouping: RoadmapGrouping): RoadmapModel {
  try {
    return parseRoadmapModel(JSON.parse(raw || "{}")) ?? emptyRoadmap(projectId, grouping);
  } catch {
    return emptyRoadmap(projectId, grouping);
  }
}

function groupingOf(value: unknown): RoadmapGrouping {
  return value === "cycles" || value === "workItems" ? value : "modules";
}

const ROW_HEIGHT = 40;
const LABEL_MAX = 180;
const LABEL_FONT = "11px sans-serif";

let labelCanvas: HTMLCanvasElement | null = null;

function measureTextPx(text: string): number {
  if (typeof document === "undefined") return text.length * 7;
  labelCanvas ??= document.createElement("canvas");
  const context = labelCanvas.getContext("2d");
  if (!context) return text.length * 7;
  context.font = LABEL_FONT;
  return Math.ceil(context.measureText(text).width);
}

function outsideLabelPx(title: string, barPx: number, textPx = measureTextPx(title)): number {
  if (textPx <= Math.max(0, barPx - 12)) return 0;
  return Math.min(LABEL_MAX, textPx + 4);
}

function barMetrics(
  bar: { start: string; end: string; kind: RoadmapBar["kind"] },
  rangeStart: string,
  unit: number,
  row: number,
) {
  const left = daysBetween(rangeStart, bar.start) * unit;
  const width =
    bar.kind === "milestone" ? 14 : Math.max(1, daysBetween(bar.start, bar.end)) * unit;
  const top = row * ROW_HEIGHT + (bar.kind === "milestone" ? 12 : 10);
  return { left, width, top, centerY: row * ROW_HEIGHT + 19 };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rangeOf(model: RoadmapModel) {
  const today = todayIso();
  const dates = [today, ...model.bars.flatMap((bar) => [bar.start, bar.end])].sort();
  const start = `${dates[0].slice(0, 8)}01`;
  const endMonth = new Date(`${dates[dates.length - 1].slice(0, 8)}01T00:00:00Z`);
  endMonth.setUTCMonth(endMonth.getUTCMonth() + 1);
  endMonth.setUTCDate(0);
  return { start, end: endMonth.toISOString().slice(0, 10), today };
}

function ticksFor(start: string, end: string, zoom: RoadmapZoom, width: number) {
  const ticks: { label: string; x: number }[] = [];
  if (zoom === "days" || zoom === "weeks") {
    const step = zoom === "days" ? 1 : 7;
    let cursor = start;
    const limit = zoom === "days" ? 120 : 90;
    for (let count = 0; cursor <= end && count < limit; count += 1) {
      ticks.push({ label: cursor.slice(5), x: daysBetween(start, cursor) * width });
      cursor = addDays(cursor, step);
    }
    return ticks;
  }
  let cursor = `${start.slice(0, 8)}01`;
  for (let count = 0; cursor <= end && count < 48; count += 1) {
    const month = Number(cursor.slice(5, 7));
    if (zoom === "months" || month % 3 === 1) {
      const quarter = Math.floor((month - 1) / 3) + 1;
      ticks.push({
        label: zoom === "quarters" ? `Q${quarter} ${cursor.slice(0, 4)}` : cursor.slice(0, 7),
        x: Math.max(0, daysBetween(start, cursor) * width),
      });
    }
    const date = new Date(`${cursor}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return ticks;
}

function laneLabel(lane: RoadmapLane, t: (key: string) => string): string {
  if (!lane.overridden && lane.planeId === "unassigned") return t("Unassigned");
  if (!lane.overridden && lane.planeId === "work-items") return t("Work items");
  return lane.title;
}

export default function PlaneRoadmapView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const { t } = useTranslation();
  const isEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isEditable,
  });
  const projectId = String(node.attrs.projectId || "");
  const grouping = groupingOf(node.attrs.grouping);
  const nodeId = String(node.attrs.id || "");
  const fallback = readModel(String(node.attrs.data || "{}"), projectId, grouping);
  const [shared, setShared] = useState<RoadmapModel | null>(null);
  const model = shared ?? fallback;
  const [projects, setProjects] = useState<PlaneProject[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [viewerZoom, setViewerZoom] = useState<RoadmapZoom | null>(null);
  const [trackBudget, setTrackBudget] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ id: string; start: string; end: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const markerId = useId().replace(/:/g, "");
  const updateRef = useRef(updateAttributes);
  updateRef.current = updateAttributes;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    if (nodeId) return;
    const handle = window.setTimeout(() => {
      updateRef.current({ id: `rm${Math.random().toString(36).slice(2, 10)}` });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    const map = roadmapMap(editor, nodeId);
    if (!map) return;
    const raw = String(node.attrs.data || "");
    if (map.get("migrated") !== true) {
      migrateRoadmap(map, raw, fallbackRef.current);
      if (raw && raw !== "{}") updateRef.current({ data: "{}" });
    }
    const pull = () => {
      const next = readSharedRoadmap(map, fallbackRef.current);
      setShared((current) =>
        current && JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    const handle = window.setTimeout(pull, 0);
    map.observeDeep(pull);
    return () => {
      window.clearTimeout(handle);
      map.unobserveDeep(pull);
    };
  }, [editor, nodeId, node.attrs.data]);

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
        setError(getApiErrorMessage(err, t("Failed to load the roadmap.")));
      });
    return () => {
      active = false;
    };
  }, [t]);

  function commit(next: RoadmapModel) {
    const id = nodeId || `rm${Math.random().toString(36).slice(2, 10)}`;
    const map = roadmapMap(editor, id);
    if (map) writeChangedRoadmap(map, model, next);
    const patch: Record<string, string> = {};
    if (id !== nodeId) patch.id = id;
    if (next.projectId !== projectId) patch.projectId = next.projectId;
    if (next.grouping !== grouping) patch.grouping = next.grouping;
    if (String(node.attrs.data || "{}") !== "{}") patch.data = "{}";
    if (Object.keys(patch).length) updateAttributes(patch);
  }

  function sync(nextProjectId = model.projectId, nextGrouping = model.grouping) {
    if (!nextProjectId) return;
    setSyncing(true);
    setError("");
    const current = { ...model, projectId: nextProjectId, grouping: nextGrouping };
    getPlaneRoadmap(nextProjectId, nextGrouping, current)
      .then((result) => {
        setConfigured(result.configured);
        if (!result.configured || !result.model) {
          setError(t("Plane is not configured."));
          return;
        }
        commit(result.model);
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, t("Failed to load the roadmap.")));
      })
      .finally(() => setSyncing(false));
  }

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const apply = () => setTrackBudget(Math.max(0, node.clientWidth - 180));
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [model.projectId, model.lanes.length]);

  const range = rangeOf(model);
  const barDates = model.bars.flatMap((bar) => [bar.start, bar.end]).sort();
  const spanDays = barDates.length
    ? Math.max(1, daysBetween(barDates[0], barDates[barDates.length - 1]))
    : 0;
  let fittedZoom: RoadmapZoom = "months";
  if (trackBudget > 0 && spanDays > 0) fittedZoom = zoomForWidth(spanDays, LABEL_MAX, trackBudget);
  else if (barDates.length) fittedZoom = zoomForSpan(barDates[0], barDates[barDates.length - 1]);
  let zoom = fittedZoom;
  if (!isEditable && viewerZoom) zoom = viewerZoom;
  else if (model.zoomManual) zoom = model.zoom;
  const width = roadmapDayWidth(zoom);
  const span = Math.max(1, daysBetween(range.start, range.end));
  const ticks = ticksFor(range.start, range.end, zoom, width);
  const todayX = daysBetween(range.start, range.today) * width;
  const laneOrder = orderedLanes(model.lanes);
  const displayBars = model.bars.map((bar) =>
    preview?.id === bar.id ? { ...bar, start: preview.start, end: preview.end } : bar,
  );
  const packedBars = displayBars.map((bar) => {
    const barPx =
      bar.kind === "milestone" ? 14 : Math.max(width, Math.max(1, daysBetween(bar.start, bar.end)) * width);
    return {
      id: bar.id,
      laneId: bar.laneId,
      start: bar.start,
      end: bar.end,
      barPx,
      labelPx: outsideLabelPx(bar.title, barPx),
    };
  });
  const layout = packRoadmapRows(
    laneOrder.map((lane) => lane.id),
    packedBars,
    width,
  );
  const labelTail = packedBars.reduce((max, bar) => Math.max(max, bar.labelPx), 0);
  const trackWidth = span * width + labelTail;
  const laneLayout = new Map(layout.lanes.map((lane) => [lane.id, lane]));
  const barLayout = new Map(layout.bars.map((bar) => [bar.id, bar]));

  return (
    <NodeViewWrapper data-drag-handle>
      <div contentEditable={false}>
        <Group justify="space-between" mb="xs" wrap="wrap">
          <Text fw={600} size="sm">
            {t("Plane roadmap")}
          </Text>
          <Group gap="xs" wrap="wrap">
            <SegmentedControl
              size="xs"
              value={zoom}
              onChange={(value) => {
                const next: RoadmapZoom =
                  value === "days" || value === "weeks" || value === "quarters" ? value : "months";
                if (isEditable) commit(setZoom(model, next));
                else setViewerZoom(next);
              }}
              data={[
                { value: "days", label: t("Days") },
                { value: "weeks", label: t("Weeks") },
                { value: "months", label: t("Months") },
                { value: "quarters", label: t("Quarters") },
              ]}
            />
            <Tooltip label={t("Export PNG")}>
              <Button
                size="compact-xs"
                variant="default"
                leftSection={<IconDownload size={14} />}
                disabled={!model.projectId || !model.lanes.length}
                onClick={() => exportRoadmapPng(model, zoom, t)}
              >
                {t("Export PNG")}
              </Button>
            </Tooltip>
            {isEditable && (
              <Tooltip label={t("Sync from Plane")}>
                <Button
                  size="compact-xs"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  loading={syncing}
                  disabled={!model.projectId}
                  onClick={() => sync()}
                >
                  {t("Sync from Plane")}
                </Button>
              </Tooltip>
            )}
          </Group>
        </Group>

        {isEditable && (
          <Group mb="xs" grow align="flex-end">
            <Select
              label={t("Project")}
              placeholder={t("Select a project")}
              data={projects.map((project) => ({
                value: project.id,
                label: project.identifier
                  ? `${project.name} (${project.identifier})`
                  : project.name,
              }))}
              value={model.projectId || null}
              onChange={(value) => {
                const nextId = value ? String(value) : "";
                if (nextId === model.projectId) return;
                commit({ ...emptyRoadmap(nextId, model.grouping), zoom: model.zoom });
              }}
              allowDeselect={false}
              nothingFoundMessage={t("No projects")}
            />
            <Select
              label={t("Grouping")}
              data={[
                { value: "modules", label: t("Modules") },
                { value: "cycles", label: t("Cycles") },
                { value: "workItems", label: t("Work items") },
              ]}
              value={model.grouping}
              onChange={(value) =>
                commit({ ...model, grouping: groupingOf(value) })
              }
              allowDeselect={false}
            />
          </Group>
        )}

        {!configured && <Text size="sm">{t("Plane is not configured.")}</Text>}
        {error && (
          <Text size="sm" c="red" mb="xs">
            {error}
          </Text>
        )}
        {!model.projectId && (
          <Text size="sm">
            {isEditable ? t("Select a project") : t("This roadmap is not set up.")}
          </Text>
        )}

        {model.projectId && (
          <>
            {isEditable && (
              <Group mb="xs" gap="xs">
                <Button
                  size="compact-xs"
                  variant="default"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => commit(addLane(model, t("Lane")))}
                >
                  {t("Add lane")}
                </Button>
                <Button
                  size="compact-xs"
                  variant="default"
                  disabled={!model.lanes.length}
                  onClick={() => {
                    const laneId = model.lanes[0]?.id;
                    if (!laneId) return;
                    const start = todayIso();
                    commit(addManualBar(model, laneId, t("Bar"), start, addDays(start, 14)));
                  }}
                >
                  {t("Add bar")}
                </Button>
                <Button
                  size="compact-xs"
                  variant="default"
                  disabled={!model.lanes.length}
                  onClick={() => {
                    const laneId = model.lanes[0]?.id;
                    if (!laneId) return;
                    const start = todayIso();
                    commit(addManualBar(model, laneId, t("Milestone"), start, start));
                  }}
                >
                  {t("Add milestone")}
                </Button>
              </Group>
            )}
            {!model.lanes.length && (
              <Text size="sm" mb="xs">
                {t("No lanes yet.")}
              </Text>
            )}
            {model.unscheduledCount > 0 && (
              <Text size="sm" c="dimmed" mb="xs">
                {t("{{total}} unscheduled", { total: model.unscheduledCount })}
              </Text>
            )}
            <div className={classes.scroll} ref={scrollRef}>
              <div className={classes.chart}>
              <div className={classes.grid} style={{ width: 180 + trackWidth }}>
                <div />
                <div className={classes.track} style={{ height: 22 }}>
                  {ticks.map((tick) => (
                    <span key={`${tick.label}-${tick.x}`} className={classes.tick} style={{ left: tick.x }}>
                      {tick.label}
                    </span>
                  ))}
                </div>
                {laneOrder.map((lane) => (
                  <LaneRow
                    key={lane.id}
                    lane={lane}
                    model={model}
                    editable={Boolean(isEditable)}
                    trackWidth={trackWidth}
                    dayWidth={width}
                    rangeStart={range.start}
                    todayX={todayX}
                    preview={preview}
                    editingId={editingId}
                    rowCount={laneLayout.get(lane.id)?.rowCount ?? 1}
                    barLayout={barLayout}
                    onCommit={commit}
                    onPreview={setPreview}
                    onEdit={setEditingId}
                    t={t}
                  />
                ))}
              </div>
              <DependencyArrows
                bars={displayBars}
                placed={layout.bars}
                totalRows={layout.lanes.reduce((sum, lane) => sum + lane.rowCount, 0)}
                rangeStart={range.start}
                dayWidth={width}
                trackWidth={trackWidth}
                markerId={markerId}
              />
              </div>
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function LaneName({
  lane,
  editable,
  label,
  onCommit,
  t,
}: {
  lane: RoadmapLane;
  editable: boolean;
  label: string;
  onCommit: (title: string) => void;
  t: (key: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  if (editable && editing) {
    return (
      <input
        autoFocus
        key={`${lane.id}:${lane.title}`}
        className={classes.laneInput}
        defaultValue={lane.title}
        aria-label={t("Lane")}
        title={lane.title}
        onBlur={(event) => {
          const title = event.currentTarget.value.trim();
          if (title && title !== lane.title) onCommit(title);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <div
      className={classes.laneName}
      data-roadmap-lane=""
      title={lane.title}
      onClick={() => {
        if (editable) setEditing(true);
      }}
    >
      {label}
    </div>
  );
}

function LaneRow({
  lane,
  model,
  editable,
  trackWidth,
  dayWidth,
  rangeStart,
  todayX,
  preview,
  editingId,
  rowCount,
  barLayout,
  onCommit,
  onPreview,
  onEdit,
  t,
}: {
  lane: RoadmapLane;
  model: RoadmapModel;
  editable: boolean;
  trackWidth: number;
  dayWidth: number;
  rangeStart: string;
  todayX: number;
  preview: { id: string; start: string; end: string } | null;
  editingId: string | null;
  rowCount: number;
  barLayout: Map<string, { row: number; laneRow: number; labelPx: number }>;
  onCommit: (next: RoadmapModel) => void;
  onPreview: (preview: { id: string; start: string; end: string } | null) => void;
  onEdit: (id: string | null) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const bars = model.bars.filter((bar) => bar.laneId === lane.id);
  const laneHeight = rowCount * ROW_HEIGHT;
  return (
    <>
      <div
        className={lane.parentId ? `${classes.laneLabel} ${classes.subLane}` : classes.laneLabel}
        style={{ minHeight: laneHeight }}
      >
        <LaneName
          lane={lane}
          editable={editable}
          label={laneLabel(lane, t)}
          onCommit={(title) => onCommit(updateLane(model, lane.id, title))}
          t={t}
        />
        {editable && !lane.parentId && (
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label={t("Add sub-lane")}
            onClick={() => onCommit(addLane(model, t("Sub-lane"), lane.id))}
          >
            <IconPlus size={14} />
          </ActionIcon>
        )}
        {editable && (
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label={t("Delete")}
            onClick={() => onCommit(removeLane(model, lane.id))}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </div>
      <div className={classes.track} style={{ width: trackWidth, minHeight: laneHeight }}>
        <div className={classes.today} style={{ left: todayX }} title={t("Today")} />
        {bars.map((bar) => (
          <RoadmapBarView
            key={bar.id}
            bar={preview?.id === bar.id ? { ...bar, start: preview.start, end: preview.end } : bar}
            model={model}
            editable={editable}
            dayWidth={dayWidth}
            rangeStart={rangeStart}
            laneRow={barLayout.get(bar.id)?.laneRow ?? 0}
            labelPx={barLayout.get(bar.id)?.labelPx ?? 0}
            editing={editingId === bar.id}
            onCommit={onCommit}
            onPreview={onPreview}
            onEdit={onEdit}
            t={t}
          />
        ))}
      </div>
    </>
  );
}

function RoadmapBarView({
  bar,
  model,
  editable,
  dayWidth,
  rangeStart,
  laneRow,
  labelPx,
  editing,
  onCommit,
  onPreview,
  onEdit,
  t,
}: {
  bar: RoadmapBar;
  model: RoadmapModel;
  editable: boolean;
  dayWidth: number;
  rangeStart: string;
  laneRow: number;
  labelPx: number;
  editing: boolean;
  onCommit: (next: RoadmapModel) => void;
  onPreview: (preview: { id: string; start: string; end: string } | null) => void;
  onEdit: (id: string | null) => void;
  t: (key: string) => string;
}) {
  const box = barMetrics(bar, rangeStart, dayWidth, laneRow);

  function begin(event: React.PointerEvent, edge: DragEdge) {
    if (!editable) {
      if (edge === "move") onEdit(editing ? null : bar.id);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const drag: DragState = {
      id: bar.id,
      originX: event.clientX,
      start: bar.start,
      end: bar.end,
      nextStart: bar.start,
      nextEnd: bar.end,
      edge,
      moved: false,
    };
    const onMove = (pointer: PointerEvent) => {
      const delta = Math.round((pointer.clientX - drag.originX) / dayWidth);
      if (delta !== 0) drag.moved = true;
      let start = drag.start;
      let end = drag.end;
      if (drag.edge === "move") {
        start = addDays(drag.start, delta);
        end = addDays(drag.end, delta);
      } else if (drag.edge === "start") {
        start = addDays(drag.start, delta);
        if (start > end) start = end;
      } else {
        end = addDays(drag.end, delta);
        if (end < start) end = start;
      }
      drag.nextStart = start;
      drag.nextEnd = end;
      onPreview({ id: drag.id, start, end });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onPreview(null);
      if (!drag.moved) {
        onEdit(drag.id);
        return;
      }
      onCommit(updateBar(model, drag.id, { start: drag.nextStart, end: drag.nextEnd }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const control = (
    <button
      type="button"
      data-roadmap-bar=""
      className={bar.kind === "milestone" ? classes.milestone : classes.bar}
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        background: bar.color,
        cursor: editable ? "grab" : "default",
      }}
      title={bar.title}
      onPointerDown={(event) => begin(event, "move")}
    >
      {bar.kind === "bar" && labelPx === 0 ? bar.title : ""}
      {editable && bar.kind === "bar" && (
        <>
          <span
            className={classes.handle}
            style={{ left: 0 }}
            onPointerDown={(event) => begin(event, "start")}
          />
          <span
            className={classes.handle}
            style={{ right: 0 }}
            onPointerDown={(event) => begin(event, "end")}
          />
        </>
      )}
    </button>
  );

  const details = (
    <>
      {editable && (
        <>
          <TextInput
            label={t("Title")}
            defaultValue={bar.title}
            key={`${bar.id}:${bar.title}`}
            mb="xs"
            onBlur={(event) => {
              const title = event.currentTarget.value.trim();
              if (title && title !== bar.title) onCommit(updateBar(model, bar.id, { title }));
            }}
          />
          <Group gap={4} mb="xs">
            {ROADMAP_COLORS.map((color) => (
              <ActionIcon
                key={color}
                size="sm"
                variant={color === bar.color ? "filled" : "default"}
                aria-label={t("Color")}
                style={{ background: color }}
                onClick={() => onCommit(updateBar(model, bar.id, { color }))}
              />
            ))}
          </Group>
          <Select
            label={t("Depends on")}
            placeholder={t("Depends on")}
            data={model.bars
              .filter((item) => item.id !== bar.id && !bar.dependsOn.includes(item.id))
              .map((item) => ({ value: item.id, label: item.title }))}
            value={null}
            onChange={(value) => {
              if (!value) return;
              onCommit(updateBar(model, bar.id, { dependsOn: [...bar.dependsOn, String(value)] }));
            }}
            mb="xs"
            clearable
          />
          {bar.dependsOn.map((id) => {
            const other = model.bars.find((item) => item.id === id);
            return (
              <Group key={id} gap={4} mb={4} justify="space-between">
                <Text size="xs">{other?.title || id}</Text>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label={t("Delete")}
                  onClick={() =>
                    onCommit(
                      updateBar(model, bar.id, {
                        dependsOn: bar.dependsOn.filter((item) => item !== id),
                      }),
                    )
                  }
                >
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            );
          })}
          <TextInput
            label={t("Link")}
            defaultValue={bar.link?.href ?? ""}
            key={`${bar.id}:${bar.link?.href ?? ""}`}
            mb="xs"
            onBlur={(event) => {
              const href = event.currentTarget.value.trim();
              if (!href) {
                if (bar.link) onCommit(updateBar(model, bar.id, { link: null }));
                return;
              }
              const kind = href.includes("/projects/") ? "plane" : "page";
              onCommit(
                updateBar(model, bar.id, {
                  link: { kind, href, label: bar.link?.label || bar.title },
                }),
              );
            }}
          />
          <Button
            size="compact-xs"
            color="red"
            variant="light"
            onClick={() => {
              onEdit(null);
              onCommit(removeBar(model, bar.id));
            }}
          >
            {t("Delete")}
          </Button>
        </>
      )}
      {bar.link && (
        <Anchor href={bar.link.href} target="_blank" rel="noopener noreferrer">
          {bar.link.label || bar.link.href}
        </Anchor>
      )}
      {!editable && !bar.link && <Text size="sm">{bar.title}</Text>}
    </>
  );

  return (
    <>
      <Popover
        opened={editing}
        onChange={(opened) => onEdit(opened ? bar.id : null)}
        position="bottom"
        withArrow
      >
        <Popover.Target>{control}</Popover.Target>
        <Popover.Dropdown>{details}</Popover.Dropdown>
      </Popover>
      {labelPx > 0 && (
        <span
          data-roadmap-label=""
          className={classes.outsideLabel}
          style={{ left: box.left + box.width + 4, top: box.top, width: Math.max(0, labelPx - 4) }}
          title={bar.title}
        >
          {bar.title}
        </span>
      )}
    </>
  );
}

function orderedLanes(lanes: RoadmapLane[]): RoadmapLane[] {
  const rows: RoadmapLane[] = [];
  for (const lane of lanes) {
    if (lane.parentId) continue;
    rows.push(lane);
    for (const child of lanes) {
      if (child.parentId === lane.id) rows.push(child);
    }
  }
  return rows;
}

function DependencyArrows({
  bars,
  placed,
  totalRows,
  rangeStart,
  dayWidth,
  trackWidth,
  markerId,
}: {
  bars: RoadmapBar[];
  placed: { id: string; row: number; laneRow: number }[];
  totalRows: number;
  rangeStart: string;
  dayWidth: number;
  trackWidth: number;
  markerId: string;
}) {
  const rows = new Map(placed.map((bar) => [bar.id, bar.row]));
  const height = Math.max(totalRows * ROW_HEIGHT, 1);
  const arrows = bars.flatMap((bar) =>
    bar.dependsOn.map((dependencyId) => {
      const from = bars.find((item) => item.id === dependencyId);
      const fromRow = rows.get(dependencyId);
      const toRow = rows.get(bar.id);
      if (!from || fromRow === undefined || toRow === undefined) return null;
      const fromBox = barMetrics(from, rangeStart, dayWidth, fromRow);
      const toBox = barMetrics(bar, rangeStart, dayWidth, toRow);
      const x1 = fromBox.left + fromBox.width;
      const y1 = fromBox.centerY;
      const x2 = toBox.left;
      const y2 = toBox.centerY;
      const mid = (x1 + x2) / 2;
      return (
        <path
          key={`${from.id}-${bar.id}`}
          d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
          stroke="#868e96"
          strokeWidth="2"
          fill="none"
          markerEnd={`url(#${markerId})`}
        />
      );
    }),
  );
  return (
    <svg
      className={classes.arrows}
      width={trackWidth}
      height={height}
      style={{ width: trackWidth, height }}
      aria-hidden="true"
    >
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="#868e96" />
        </marker>
      </defs>
      {arrows}
    </svg>
  );
}

function wrapLabel(context: CanvasRenderingContext2D, title: string, maxWidth: number): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [title];
}

function clippedTitle(context: CanvasRenderingContext2D, title: string, maxWidth: number): string {
  if (maxWidth <= 4) return "";
  if (context.measureText(title).width <= maxWidth) return title;
  const mark = "…";
  let end = title.length;
  while (end > 0 && context.measureText(`${title.slice(0, end)}${mark}`).width > maxWidth) end -= 1;
  return end === 0 ? "" : `${title.slice(0, end)}${mark}`;
}

function exportRoadmapPng(
  model: RoadmapModel,
  zoom: RoadmapZoom,
  t: (key: string) => string,
) {
  const rows = orderedLanes(model.lanes);
  if (!rows.length) return;
  const range = rangeOf(model);
  const width = roadmapDayWidth(zoom);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  context.font = LABEL_FONT;
  const packedBars = model.bars.map((bar) => {
    const barPx =
      bar.kind === "milestone" ? 14 : Math.max(width, Math.max(1, daysBetween(bar.start, bar.end)) * width);
    const textPx = Math.ceil(context.measureText(bar.title).width);
    return {
      id: bar.id,
      laneId: bar.laneId,
      start: bar.start,
      end: bar.end,
      barPx,
      labelPx: outsideLabelPx(bar.title, barPx, textPx),
    };
  });
  const layout = packRoadmapRows(
    rows.map((lane) => lane.id),
    packedBars,
    width,
  );
  const placed = new Map(layout.bars.map((bar) => [bar.id, bar]));
  const laneLayout = new Map(layout.lanes.map((lane) => [lane.id, lane]));
  const totalRows = layout.lanes.reduce((sum, lane) => sum + lane.rowCount, 0);
  const labelWidth = 180;
  const labelTail = packedBars.reduce((max, bar) => Math.max(max, bar.labelPx), 0);
  const trackWidth = Math.max(1, daysBetween(range.start, range.end)) * width + labelTail;
  const header = 28;
  const body = Math.max(totalRows, 1) * ROW_HEIGHT;
  const scale = 2;
  canvas.width = Math.ceil((labelWidth + trackWidth) * scale);
  canvas.height = Math.ceil((header + body) * scale);
  context.scale(scale, scale);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, labelWidth + trackWidth, header + body);
  context.strokeStyle = "#dee2e6";
  context.strokeRect(0, 0, labelWidth + trackWidth, header + body);
  context.fillStyle = "#868e96";
  context.font = "11px sans-serif";
  for (const tick of ticksFor(range.start, range.end, zoom, width)) {
    context.fillText(tick.label, labelWidth + tick.x, 16);
  }
  const todayX = labelWidth + daysBetween(range.start, range.today) * width;
  context.strokeStyle = "#fa5252";
  context.beginPath();
  context.moveTo(todayX, header);
  context.lineTo(todayX, header + body);
  context.stroke();
  for (const lane of rows) {
    const slot = laneLayout.get(lane.id);
    const top = header + (slot?.rowStart ?? 0) * ROW_HEIGHT;
    const laneHeight = (slot?.rowCount ?? 1) * ROW_HEIGHT;
    context.strokeStyle = "#dee2e6";
    context.beginPath();
    context.moveTo(0, top);
    context.lineTo(labelWidth + trackWidth, top);
    context.stroke();
    context.save();
    context.beginPath();
    context.rect(0, top, labelWidth - 4, laneHeight);
    context.clip();
    context.fillStyle = "#212529";
    context.font = "13px sans-serif";
    const laneLines = wrapLabel(context, laneLabel(lane, t), labelWidth - (lane.parentId ? 32 : 16));
    laneLines.forEach((line, index) => {
      const lineY = top + 16 + index * 16;
      if (lineY < top + laneHeight - 2) context.fillText(line, lane.parentId ? 24 : 8, lineY);
    });
    context.restore();
    for (const bar of model.bars.filter((item) => item.laneId === lane.id)) {
      const slotBar = placed.get(bar.id);
      const box = barMetrics(bar, range.start, width, slotBar?.row ?? slot?.rowStart ?? 0);
      const x = labelWidth + box.left;
      const y = header + box.top;
      const outside = slotBar?.labelPx ?? 0;
      context.fillStyle = bar.color;
      if (bar.kind === "milestone") {
        context.save();
        context.translate(x + 7, y + 7);
        context.rotate(Math.PI / 4);
        context.fillRect(-6, -6, 12, 12);
        context.restore();
      } else {
        context.fillRect(x, y, box.width, 18);
        if (outside === 0) {
          context.save();
          context.beginPath();
          context.rect(x, y, box.width, 18);
          context.clip();
          context.fillStyle = "#ffffff";
          context.font = LABEL_FONT;
          const label = clippedTitle(context, bar.title, box.width - 8);
          if (label) context.fillText(label, x + 4, y + 13);
          context.restore();
        }
      }
      if (outside > 0) {
        context.save();
        context.beginPath();
        context.rect(x + box.width + 4, y, Math.max(0, outside - 4), 18);
        context.clip();
        context.fillStyle = "#212529";
        context.font = LABEL_FONT;
        const label = clippedTitle(context, bar.title, Math.max(0, outside - 4));
        if (label) context.fillText(label, x + box.width + 4, y + 13);
        context.restore();
      }
    }
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "roadmap.png";
    link.click();
    URL.revokeObjectURL(url);
  });
}
