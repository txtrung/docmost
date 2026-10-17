export type RoadmapSource = "plane" | "manual";
export type RoadmapGrouping = "cycles" | "modules" | "workItems";
export type RoadmapZoom = "weeks" | "months" | "quarters";
export type RoadmapKind = "bar" | "milestone";

export type RoadmapLink = {
  kind: "page" | "plane";
  href: string;
  label: string;
};

export type RoadmapLane = {
  id: string;
  title: string;
  source: RoadmapSource;
  planeId: string | null;
  overridden: boolean;
  parentId: string | null;
};

export type RoadmapBar = {
  id: string;
  laneId: string;
  title: string;
  start: string;
  end: string;
  color: string;
  kind: RoadmapKind;
  source: RoadmapSource;
  planeId: string | null;
  overridden: boolean;
  dependsOn: string[];
  link: RoadmapLink | null;
};

export type RoadmapModel = {
  projectId: string;
  grouping: RoadmapGrouping;
  zoom: RoadmapZoom;
  lanes: RoadmapLane[];
  bars: RoadmapBar[];
  removedPlaneIds: string[];
};

export type RoadmapPlaneLane = {
  id: string;
  title: string;
};

export type RoadmapPlaneItem = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  laneKey: string | null;
};

export const ROADMAP_COLORS = [
  "#4c6ef5",
  "#12b886",
  "#fab005",
  "#fa5252",
  "#7950f2",
  "#15aabf",
  "#e8590c",
  "#74b816",
];

const MAX_LANES = 50;
const MAX_BARS = 400;
const MAX_TITLE = 200;
const MAX_REMOVED = 500;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9:_-]{1,80}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function emptyRoadmap(
  projectId = "",
  grouping: RoadmapGrouping = "modules",
): RoadmapModel {
  return {
    projectId,
    grouping,
    zoom: "months",
    lanes: [],
    bars: [],
    removedPlaneIds: [],
  };
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function buildRoadmapFromPlane(input: {
  projectId: string;
  grouping: RoadmapGrouping;
  lanes: RoadmapPlaneLane[];
  items: RoadmapPlaneItem[];
  zoom?: RoadmapZoom;
}): RoadmapModel {
  const lanes: RoadmapLane[] = [];
  const laneIds = new Set<string>();

  const addLane = (planeId: string, title: string) => {
    if (lanes.length >= MAX_LANES) return;
    const id = `plane:lane:${planeId}`;
    if (laneIds.has(id)) return;
    laneIds.add(id);
    lanes.push({
      id,
      title: clampTitle(title),
      source: "plane",
      planeId,
      overridden: false,
      parentId: null,
    });
  };

  if (input.grouping === "workItems") {
    addLane("work-items", "Work items");
  } else {
    for (const lane of input.lanes) addLane(lane.id, lane.title);
  }

  const bars: RoadmapBar[] = [];
  const seen = new Set<string>();
  let needsUnassigned = false;

  for (const item of input.items) {
    const span = spanFrom(item.start, item.end);
    if (!span) continue;
    let laneKey = input.grouping === "workItems" ? "work-items" : item.laneKey;
    if (!laneKey || !laneIds.has(`plane:lane:${laneKey}`)) {
      if (input.grouping === "workItems") continue;
      needsUnassigned = true;
      laneKey = "unassigned";
    }
    const id = `plane:${item.id}`;
    if (seen.has(id) || bars.length >= MAX_BARS) continue;
    seen.add(id);
    bars.push({
      id,
      laneId: `plane:lane:${laneKey}`,
      title: clampTitle(item.title),
      start: span.start,
      end: span.end,
      color: colorFor(item.id),
      kind: span.start === span.end ? "milestone" : "bar",
      source: "plane",
      planeId: item.id,
      overridden: false,
      dependsOn: [],
      link: null,
    });
  }

  if (needsUnassigned) addLane("unassigned", "Unassigned");

  return {
    projectId: input.projectId.slice(0, 64),
    grouping: input.grouping,
    zoom: zoomOf(input.zoom),
    lanes,
    bars: bars.filter((bar) => lanes.some((lane) => lane.id === bar.laneId)),
    removedPlaneIds: [],
  };
}

export function parseRoadmapModel(raw: unknown): RoadmapModel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const grouping = groupingOf(value.grouping);
  if (!grouping) return null;

  const lanes: RoadmapLane[] = [];
  const laneIds = new Set<string>();
  if (!Array.isArray(value.lanes)) return null;
  for (const item of value.lanes) {
    const lane = parseLane(item);
    if (!lane || laneIds.has(lane.id)) continue;
    laneIds.add(lane.id);
    lanes.push(lane);
    if (lanes.length >= MAX_LANES) break;
  }

  const bars: RoadmapBar[] = [];
  const barIds = new Set<string>();
  if (!Array.isArray(value.bars)) return null;
  for (const item of value.bars) {
    const bar = parseBar(item, laneIds);
    if (!bar || barIds.has(bar.id)) continue;
    barIds.add(bar.id);
    bars.push(bar);
    if (bars.length >= MAX_BARS) break;
  }

  const settled = settleRoadmap(lanes, bars);
  return {
    projectId:
      typeof value.projectId === "string" ? value.projectId.slice(0, 64) : "",
    grouping,
    zoom: zoomOf(value.zoom),
    lanes: settled.lanes,
    bars: settled.bars,
    removedPlaneIds: parseRemoved(value.removedPlaneIds),
  };
}

export function mergeRoadmap(currentRaw: unknown, fresh: RoadmapModel): RoadmapModel {
  const current = parseRoadmapModel(currentRaw);
  if (!current) return fresh;

  // Remember deletions so a later sync does not put the Plane item back.
  const removed = new Set(current.removedPlaneIds);
  const lanes: RoadmapLane[] = [];

  for (const lane of fresh.lanes) {
    if (lane.planeId && removed.has(lane.planeId)) continue;
    const prev = current.lanes.find(
      (item) => item.source === "plane" && item.planeId === lane.planeId,
    );
    lanes.push(
      prev?.overridden
        ? { ...prev, source: "plane", planeId: lane.planeId }
        : lane,
    );
  }

  for (const lane of current.lanes) {
    if (lane.source !== "plane" || !lane.planeId || !lane.overridden) continue;
    if (removed.has(lane.planeId)) continue;
    if (lanes.some((item) => item.planeId === lane.planeId)) continue;
    lanes.push(lane);
  }

  for (const lane of current.lanes) {
    if (lane.source === "manual") lanes.push(lane);
  }

  let cappedLanes = lanes.slice(0, MAX_LANES);
  const orphanManual = current.bars.some(
    (bar) => bar.source === "manual" || bar.overridden,
  );
  if (!cappedLanes.length && orphanManual) {
    cappedLanes = [
      {
        id: "manual:kept",
        title: "Roadmap",
        source: "manual",
        planeId: null,
        overridden: false,
        parentId: null,
      },
    ];
  }
  const laneIds = new Set(cappedLanes.map((lane) => lane.id));
  const fallbackLane = cappedLanes[0]?.id;

  const bars: RoadmapBar[] = [];
  const place = (bar: RoadmapBar): RoadmapBar | null => {
    if (laneIds.has(bar.laneId)) return bar;
    if (!fallbackLane) return null;
    return { ...bar, laneId: fallbackLane };
  };

  for (const bar of fresh.bars) {
    if (bar.planeId && removed.has(bar.planeId)) continue;
    const prev = current.bars.find(
      (item) => item.source === "plane" && item.planeId === bar.planeId,
    );
    const next = place(
      prev?.overridden
        ? { ...prev, source: "plane", planeId: bar.planeId }
        : bar,
    );
    if (next) bars.push(next);
  }

  for (const bar of current.bars) {
    if (bar.source !== "plane" || !bar.planeId || !bar.overridden) continue;
    if (removed.has(bar.planeId)) continue;
    if (bars.some((item) => item.planeId === bar.planeId)) continue;
    const next = place(bar);
    if (next) bars.push(next);
  }

  for (const bar of current.bars) {
    if (bar.source !== "manual") continue;
    const next = place(bar);
    if (next) bars.push(next);
  }

  return (
    parseRoadmapModel({
      projectId: fresh.projectId,
      grouping: fresh.grouping,
      zoom: current.zoom,
      lanes: cappedLanes,
      bars: bars.slice(0, MAX_BARS),
      removedPlaneIds: [...removed].slice(0, MAX_REMOVED),
    }) ?? fresh
  );
}

export function setZoom(model: RoadmapModel, zoom: RoadmapZoom): RoadmapModel {
  return { ...model, zoom };
}

export function packRoadmapRows(
  laneIds: string[],
  bars: { id: string; laneId: string; start: string; end: string }[],
): {
  lanes: { id: string; rowStart: number; rowCount: number }[];
  bars: { id: string; row: number; laneRow: number }[];
} {
  return {
    lanes: laneIds.map((id, index) => ({ id, rowStart: index, rowCount: 1 })),
    bars: bars.map((bar) => ({
      id: bar.id,
      row: Math.max(0, laneIds.indexOf(bar.laneId)),
      laneRow: 0,
    })),
  };
}

export function addLane(
  model: RoadmapModel,
  title: string,
  parentId: string | null = null,
): RoadmapModel {
  if (model.lanes.length >= MAX_LANES) return model;
  const parent = parentId
    ? model.lanes.find((lane) => lane.id === parentId)
    : undefined;
  const resolved = parent && !parent.parentId ? parent.id : null;
  return {
    ...model,
    lanes: [
      ...model.lanes,
      {
        id: manualId(),
        title: clampTitle(title),
        source: "manual",
        planeId: null,
        overridden: false,
        parentId: resolved,
      },
    ],
  };
}

export function updateLane(
  model: RoadmapModel,
  id: string,
  title: string,
): RoadmapModel {
  return {
    ...model,
    lanes: model.lanes.map((lane) =>
      lane.id === id
        ? {
            ...lane,
            title: clampTitle(title),
            overridden: lane.source === "plane" ? true : lane.overridden,
          }
        : lane,
    ),
  };
}

export function removeLane(model: RoadmapModel, laneId: string): RoadmapModel {
  const drop = laneFamily(model.lanes, laneId);
  const removed = new Set(model.removedPlaneIds);
  for (const lane of model.lanes) {
    if (!drop.has(lane.id)) continue;
    if (lane.source === "plane" && lane.planeId) removed.add(lane.planeId);
  }
  for (const bar of model.bars) {
    if (!drop.has(bar.laneId)) continue;
    if (bar.source === "plane" && bar.planeId) removed.add(bar.planeId);
  }
  const kept = model.bars.filter((item) => !drop.has(item.laneId));
  return {
    ...model,
    lanes: model.lanes.filter((item) => !drop.has(item.id)),
    bars: stripMissingDependencies(kept),
    removedPlaneIds: [...removed],
  };
}

export function addManualBar(
  model: RoadmapModel,
  laneId: string,
  title: string,
  start: string,
  end: string,
): RoadmapModel {
  if (!model.lanes.some((lane) => lane.id === laneId)) return model;
  if (model.bars.length >= MAX_BARS) return model;
  const span = spanFrom(start, end);
  if (!span) return model;
  return {
    ...model,
    bars: [
      ...model.bars,
      {
        id: manualId(),
        laneId,
        title: clampTitle(title),
        start: span.start,
        end: span.end,
        color: ROADMAP_COLORS[model.bars.length % ROADMAP_COLORS.length],
        kind: span.start === span.end ? "milestone" : "bar",
        source: "manual",
        planeId: null,
        overridden: false,
        dependsOn: [],
        link: null,
      },
    ],
  };
}

export function updateBar(
  model: RoadmapModel,
  id: string,
  patch: {
    title?: string;
    start?: string;
    end?: string;
    color?: string;
    laneId?: string;
    dependsOn?: string[];
    link?: RoadmapLink | null;
  },
): RoadmapModel {
  const next = {
    ...model,
    bars: model.bars.map((bar) => {
      if (bar.id !== id) return bar;
      const span = spanFrom(patch.start ?? bar.start, patch.end ?? bar.end);
      if (!span) return bar;
      const laneId =
        patch.laneId && model.lanes.some((lane) => lane.id === patch.laneId)
          ? patch.laneId
          : bar.laneId;
      return {
        ...bar,
        laneId,
        title: patch.title !== undefined ? clampTitle(patch.title) : bar.title,
        start: span.start,
        end: span.end,
        color: patch.color && COLOR_RE.test(patch.color) ? patch.color : bar.color,
        kind: span.start === span.end ? "milestone" : "bar",
        dependsOn:
          patch.dependsOn !== undefined ? uniqueIds(patch.dependsOn) : bar.dependsOn,
        link: patch.link !== undefined ? parseLink(patch.link) : bar.link,
        overridden: bar.source === "plane" ? true : bar.overridden,
      };
    }),
  };
  return parseRoadmapModel(next) ?? model;
}

export function removeBar(model: RoadmapModel, id: string): RoadmapModel {
  const bar = model.bars.find((item) => item.id === id);
  const removed = new Set(model.removedPlaneIds);
  if (bar?.source === "plane" && bar.planeId) removed.add(bar.planeId);
  return {
    ...model,
    bars: stripMissingDependencies(model.bars.filter((item) => item.id !== id)),
    removedPlaneIds: [...removed],
  };
}

function parseLane(raw: unknown): RoadmapLane | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !ID_RE.test(value.id)) return null;
  const source = sourceOf(value.source);
  if (!source) return null;
  const planeId = typeof value.planeId === "string" ? value.planeId.slice(0, 80) : null;
  if (source === "plane" && !planeId) return null;
  return {
    id: value.id,
    title: clampTitle(typeof value.title === "string" ? value.title : "Lane"),
    source,
    planeId: source === "manual" ? null : planeId,
    overridden: source === "plane" && value.overridden === true,
    parentId: parentIdOf(value.parentId),
  };
}

function parseBar(raw: unknown, laneIds: Set<string>): RoadmapBar | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !ID_RE.test(value.id)) return null;
  if (typeof value.laneId !== "string" || !laneIds.has(value.laneId)) return null;
  const source = sourceOf(value.source);
  if (!source) return null;
  const planeId = typeof value.planeId === "string" ? value.planeId.slice(0, 80) : null;
  if (source === "plane" && !planeId) return null;
  const span = spanFrom(
    typeof value.start === "string" ? value.start : null,
    typeof value.end === "string" ? value.end : null,
  );
  if (!span) return null;
  const color =
    typeof value.color === "string" && COLOR_RE.test(value.color)
      ? value.color
      : colorFor(value.id);
  return {
    id: value.id,
    laneId: value.laneId,
    title: clampTitle(typeof value.title === "string" ? value.title : "Item"),
    start: span.start,
    end: span.end,
    color,
    kind: span.start === span.end ? "milestone" : "bar",
    source,
    planeId: source === "manual" ? null : planeId,
    overridden: source === "plane" && value.overridden === true,
    dependsOn: uniqueIds(value.dependsOn),
    link: parseLink(value.link),
  };
}

function settleRoadmap(lanes: RoadmapLane[], bars: RoadmapBar[]) {
  const byId = new Map(lanes.map((lane) => [lane.id, lane]));
  const settledLanes = lanes.map((lane) => {
    const parent = lane.parentId ? byId.get(lane.parentId) : undefined;
    if (!parent || parent.id === lane.id || parent.parentId) {
      return lane.parentId ? { ...lane, parentId: null } : lane;
    }
    return lane;
  });
  return { lanes: settledLanes, bars: stripMissingDependencies(bars) };
}

function stripMissingDependencies(bars: RoadmapBar[]): RoadmapBar[] {
  const ids = new Set(bars.map((bar) => bar.id));
  return bars.map((bar) => {
    const dependsOn = bar.dependsOn.filter((id) => id !== bar.id && ids.has(id));
    if (dependsOn.length === bar.dependsOn.length) return bar;
    return { ...bar, dependsOn };
  });
}

function laneFamily(lanes: RoadmapLane[], laneId: string): Set<string> {
  const drop = new Set<string>();
  const queue = [laneId];
  while (queue.length) {
    const current = queue.pop();
    if (!current || drop.has(current)) continue;
    drop.add(current);
    for (const lane of lanes) {
      if (lane.parentId === current) queue.push(lane.id);
    }
  }
  return drop;
}

function parentIdOf(value: unknown): string | null {
  return typeof value === "string" && ID_RE.test(value) ? value : null;
}

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !ID_RE.test(item) || ids.includes(item)) continue;
    ids.push(item);
    if (ids.length >= 20) break;
  }
  return ids;
}

const HREF_RE = /^(https?:\/\/|\/)\S{1,500}$/i;

function parseLink(raw: unknown): RoadmapLink | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const kind = value.kind === "page" || value.kind === "plane" ? value.kind : null;
  if (!kind || typeof value.href !== "string") return null;
  const href = value.href.trim();
  if (!HREF_RE.test(href)) return null;
  return {
    kind,
    href: href.slice(0, 500),
    label: typeof value.label === "string" ? clampTitle(value.label) : "",
  };
}

function parseRemoved(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const removed: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim().slice(0, 80);
    if (!trimmed || removed.includes(trimmed)) continue;
    removed.push(trimmed);
    if (removed.length >= MAX_REMOVED) break;
  }
  return removed;
}

function spanFrom(
  startRaw: string | null,
  endRaw: string | null,
): { start: string; end: string } | null {
  const start = asDate(startRaw);
  const end = asDate(endRaw);
  const point = start && end ? null : start || end;
  const from = start && end ? (start <= end ? start : end) : point;
  const to = start && end ? (start <= end ? end : start) : point;
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  return { start: from, end: to };
}

function asDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

function clampTitle(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Item").slice(0, MAX_TITLE);
}

function colorFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return ROADMAP_COLORS[hash % ROADMAP_COLORS.length];
}

function groupingOf(value: unknown): RoadmapGrouping | null {
  if (value === "cycles" || value === "modules" || value === "workItems") return value;
  return null;
}

function zoomOf(value: unknown): RoadmapZoom {
  if (value === "weeks" || value === "quarters") return value;
  return "months";
}

function sourceOf(value: unknown): RoadmapSource | null {
  if (value === "plane" || value === "manual") return value;
  return null;
}

function manualId(): string {
  return `manual:${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
