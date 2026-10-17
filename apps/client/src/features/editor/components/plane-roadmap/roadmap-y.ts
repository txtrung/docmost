import type { Editor } from "@tiptap/core";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import {
  emptyRoadmap,
  parseRoadmapModel,
  type RoadmapBar,
  type RoadmapLane,
  type RoadmapLink,
  type RoadmapModel,
  type RoadmapSource,
} from "@docmost/editor-ext";

const ROOT = "docmostPlaneRoadmap";

export function roadmapMap(editor: Editor, nodeId: string): Y.Map<unknown> | null {
  const state = ySyncPluginKey.getState(editor.state) as { doc?: Y.Doc } | undefined;
  const doc = state?.doc;
  if (!doc || !nodeId) return null;
  const root = doc.getMap<Y.Map<unknown>>(ROOT);
  const existing = root.get(nodeId);
  if (existing) return existing;
  const created = new Y.Map<unknown>();
  doc.transact(() => {
    if (!root.get(nodeId)) root.set(nodeId, created);
  });
  return root.get(nodeId) ?? created;
}

export function readSharedRoadmap(map: Y.Map<unknown>, fallback: RoadmapModel): RoadmapModel {
  const lanesMap = map.get("lanes");
  const barsMap = map.get("bars");
  const lanes = lanesMap instanceof Y.Map ? orderBy(readLanes(lanesMap), map.get("laneOrder")) : [];
  const bars = barsMap instanceof Y.Map ? orderBy(readBars(barsMap), map.get("barOrder")) : [];
  return (
    parseRoadmapModel({
      projectId: text(map.get("projectId")) || fallback.projectId,
      grouping: map.get("grouping") || fallback.grouping,
      zoom: map.get("zoom") || fallback.zoom,
      zoomManual: map.get("zoomManual") === true,
      unscheduledCount: map.get("unscheduledCount") ?? fallback.unscheduledCount,
      lanes,
      bars,
      removedPlaneIds: parseJson(map.get("removedPlaneIds"), []),
    }) ?? fallback
  );
}

export function migrateRoadmap(map: Y.Map<unknown>, raw: string, fallback: RoadmapModel) {
  if (map.get("migrated") === true) return;
  const parsed = parseJson(raw, null);
  const model = parseRoadmapModel(parsed) ?? fallback;
  writeChangedRoadmap(map, emptyRoadmap(model.projectId, model.grouping), model);
}

export function writeChangedRoadmap(
  map: Y.Map<unknown>,
  origin: RoadmapModel,
  next: RoadmapModel,
) {
  const doc = map.doc;
  if (!doc) return;
  doc.transact(() => {
    if (origin.projectId !== next.projectId) map.set("projectId", next.projectId);
    if (origin.grouping !== next.grouping) map.set("grouping", next.grouping);
    if (origin.zoom !== next.zoom) map.set("zoom", next.zoom);
    if (origin.zoomManual !== next.zoomManual) map.set("zoomManual", next.zoomManual);
    if (origin.unscheduledCount !== next.unscheduledCount) {
      map.set("unscheduledCount", next.unscheduledCount);
    }
    if (JSON.stringify(origin.removedPlaneIds) !== JSON.stringify(next.removedPlaneIds)) {
      map.set("removedPlaneIds", JSON.stringify(next.removedPlaneIds));
    }
    const lanes = childMap(map, "lanes");
    const bars = childMap(map, "bars");
    for (const lane of next.lanes) {
      const before = origin.lanes.find((item) => item.id === lane.id);
      if (!before || JSON.stringify(before) !== JSON.stringify(lane)) writeLane(lanes, lane);
    }
    for (const lane of origin.lanes) {
      if (!next.lanes.some((item) => item.id === lane.id)) lanes.delete(lane.id);
    }
    for (const bar of next.bars) {
      const before = origin.bars.find((item) => item.id === bar.id);
      if (!before || JSON.stringify(before) !== JSON.stringify(bar)) writeBar(bars, bar);
    }
    for (const bar of origin.bars) {
      if (!next.bars.some((item) => item.id === bar.id)) bars.delete(bar.id);
    }
    if (idsOf(origin.lanes) !== idsOf(next.lanes)) {
      map.set("laneOrder", JSON.stringify(next.lanes.map((lane) => lane.id)));
    }
    if (idsOf(origin.bars) !== idsOf(next.bars)) {
      map.set("barOrder", JSON.stringify(next.bars.map((bar) => bar.id)));
    }
    map.set("migrated", true);
  });
}

function childMap(parent: Y.Map<unknown>, key: string): Y.Map<unknown> {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) return existing;
  const created = new Y.Map<unknown>();
  parent.set(key, created);
  return created;
}

function writeLane(lanes: Y.Map<unknown>, lane: RoadmapLane) {
  const entry = entryMap(lanes, lane.id);
  entry.set("title", lane.title);
  entry.set("source", lane.source);
  entry.set("planeId", lane.planeId ?? "");
  entry.set("overridden", lane.overridden);
  entry.set("parentId", lane.parentId ?? "");
}

function writeBar(bars: Y.Map<unknown>, bar: RoadmapBar) {
  const entry = entryMap(bars, bar.id);
  entry.set("laneId", bar.laneId);
  entry.set("title", bar.title);
  entry.set("start", bar.start);
  entry.set("end", bar.end);
  entry.set("color", bar.color);
  entry.set("kind", bar.kind);
  entry.set("source", bar.source);
  entry.set("planeId", bar.planeId ?? "");
  entry.set("overridden", bar.overridden);
  entry.set("dependsOn", JSON.stringify(bar.dependsOn));
  entry.set("link", bar.link ? JSON.stringify(bar.link) : "");
}

function entryMap(parent: Y.Map<unknown>, id: string): Y.Map<unknown> {
  const existing = parent.get(id);
  if (existing instanceof Y.Map) return existing;
  const created = new Y.Map<unknown>();
  parent.set(id, created);
  return created;
}

function readLanes(map: Y.Map<unknown>): RoadmapLane[] {
  const lanes: RoadmapLane[] = [];
  map.forEach((value, id) => {
    if (!(value instanceof Y.Map)) return;
    const source: RoadmapSource = value.get("source") === "manual" ? "manual" : "plane";
    lanes.push({
      id,
      title: text(value.get("title")) || "Lane",
      source,
      planeId: source === "manual" ? null : text(value.get("planeId")) || null,
      overridden: value.get("overridden") === true,
      parentId: text(value.get("parentId")) || null,
    });
  });
  return lanes;
}

function readBars(map: Y.Map<unknown>): RoadmapBar[] {
  const bars: RoadmapBar[] = [];
  map.forEach((value, id) => {
    if (!(value instanceof Y.Map)) return;
    const source: RoadmapSource = value.get("source") === "manual" ? "manual" : "plane";
    bars.push({
      id,
      laneId: text(value.get("laneId")),
      title: text(value.get("title")) || "Item",
      start: text(value.get("start")),
      end: text(value.get("end")),
      color: text(value.get("color")),
      kind: value.get("kind") === "milestone" ? "milestone" : "bar",
      source,
      planeId: source === "manual" ? null : text(value.get("planeId")) || null,
      overridden: value.get("overridden") === true,
      dependsOn: parseJson(value.get("dependsOn"), []),
      link: parseLink(value.get("link")),
    });
  });
  return bars;
}

function parseLink(raw: unknown): RoadmapLink | null {
  const value = parseJson(raw, null);
  if (!value || typeof value !== "object") return null;
  return value as RoadmapLink;
}

function orderBy<T extends { id: string }>(items: T[], raw: unknown): T[] {
  const order = parseJson(raw, null);
  if (!Array.isArray(order)) return items;
  const ids = order.filter((id): id is string => typeof id === "string");
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) ordered.push(item);
  }
  for (const item of items) {
    if (!ids.includes(item.id)) ordered.push(item);
  }
  return ordered;
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function idsOf(items: { id: string }[]): string {
  return items.map((item) => item.id).join("\n");
}
