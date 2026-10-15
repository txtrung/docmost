const MARKER_RE =
  /^%% docmost-plane project=(\S+) grouping=(cycles|modules|workItems)\s*$/;

export type PlaneRoadmapMarker = {
  projectId: string;
  grouping: "cycles" | "modules" | "workItems";
};

export function parsePlaneRoadmapMarker(source: string): PlaneRoadmapMarker | null {
  const line = source.split(/\r?\n/, 1)[0] ?? "";
  const match = MARKER_RE.exec(line);
  if (!match) return null;
  return {
    projectId: match[1],
    grouping: match[2] as PlaneRoadmapMarker["grouping"],
  };
}
