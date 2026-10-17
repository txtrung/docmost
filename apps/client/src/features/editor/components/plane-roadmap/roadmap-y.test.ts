import { addLane, addManualBar, emptyRoadmap, updateBar } from "@docmost/editor-ext";
import * as Y from "yjs";
import { migrateRoadmap, readSharedRoadmap, writeChangedRoadmap } from "./roadmap-y";

function nodeMap(doc: Y.Doc): Y.Map<unknown> {
  const root = doc.getMap<Y.Map<unknown>>("docmostPlaneRoadmap");
  const existing = root.get("node-1");
  if (existing instanceof Y.Map) return existing;
  const created = new Y.Map<unknown>();
  doc.transact(() => {
    root.set("node-1", created);
  });
  return created;
}

function sample() {
  const lane = addLane(emptyRoadmap("proj1"), "Alpha");
  const withOne = addManualBar(lane, lane.lanes[0].id, "One", "2026-01-01", "2026-01-10");
  return addManualBar(withOne, lane.lanes[0].id, "Two", "2026-02-01", "2026-02-10");
}

describe("roadmap y maps", () => {
  it("keeps concurrent edits to different bars", () => {
    const origin = new Y.Doc();
    const model = sample();
    writeChangedRoadmap(nodeMap(origin), emptyRoadmap("proj1"), model);

    const left = new Y.Doc();
    const right = new Y.Doc();
    Y.applyUpdate(left, Y.encodeStateAsUpdate(origin));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(origin));

    const base = readSharedRoadmap(nodeMap(left), emptyRoadmap());
    const one = base.bars.find((bar) => bar.title === "One");
    const two = base.bars.find((bar) => bar.title === "Two");
    expect(one && two).toBeTruthy();
    if (!one || !two) return;

    writeChangedRoadmap(nodeMap(left), base, updateBar(base, one.id, { title: "One edited" }));
    writeChangedRoadmap(nodeMap(right), base, updateBar(base, two.id, { title: "Two edited" }));

    Y.applyUpdate(left, Y.encodeStateAsUpdate(right, Y.encodeStateVector(left)));
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left, Y.encodeStateVector(right)));

    const titles = readSharedRoadmap(nodeMap(left), emptyRoadmap())
      .bars.map((bar) => bar.title)
      .sort();
    expect(titles).toEqual(["One edited", "Two edited"]);
  });

  it("copies a legacy JSON model once", () => {
    const doc = new Y.Doc();
    const map = nodeMap(doc);
    const model = sample();
    migrateRoadmap(map, JSON.stringify(model), emptyRoadmap("proj1"));
    migrateRoadmap(map, JSON.stringify(emptyRoadmap()), emptyRoadmap());
    const titles = readSharedRoadmap(map, emptyRoadmap()).bars.map((bar) => bar.title).sort();
    expect(titles).toEqual(["One", "Two"]);
    expect(map.get("migrated")).toBe(true);
  });
});
