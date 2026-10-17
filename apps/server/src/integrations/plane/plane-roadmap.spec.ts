import {
  addLane,
  addManualBar,
  buildRoadmapFromPlane,
  mergeRoadmap,
  parseRoadmapModel,
  removeBar,
  removeLane,
  updateBar,
} from '../../../../../packages/editor-ext/src/lib/plane-roadmap/model';

function fresh() {
  return buildRoadmapFromPlane({
    projectId: 'project-1',
    grouping: 'modules',
    lanes: [
      { id: 'mod-a', title: 'Alpha' },
      { id: 'mod-b', title: 'Beta' },
    ],
    items: [
      {
        id: 'item-1',
        title: 'APP-1 Write docs',
        start: '2026-01-05',
        end: '2026-01-20',
        laneKey: 'mod-a',
      },
      {
        id: 'item-2',
        title: 'APP-2 Ship',
        start: '2026-02-01',
        end: '2026-02-01',
        laneKey: 'missing',
      },
      {
        id: 'item-3',
        title: 'APP-3 Undated',
        start: null,
        end: null,
        laneKey: 'mod-a',
      },
    ],
  });
}

describe('buildRoadmapFromPlane', () => {
  it('builds module lanes, dated bars, and a milestone for a single day', () => {
    const model = fresh();
    expect(model.lanes.map((lane) => lane.planeId)).toEqual([
      'mod-a',
      'mod-b',
      'unassigned',
    ]);
    expect(model.bars.map((bar) => [bar.planeId, bar.kind, bar.laneId])).toEqual([
      ['item-1', 'bar', 'plane:lane:mod-a'],
      ['item-2', 'milestone', 'plane:lane:unassigned'],
    ]);
  });

  it('uses one lane for work items', () => {
    const model = buildRoadmapFromPlane({
      projectId: 'project-1',
      grouping: 'workItems',
      lanes: [],
      items: [
        {
          id: 'item-1',
          title: 'Docs',
          start: '2026-03-01',
          end: '2026-03-10',
          laneKey: null,
        },
      ],
    });
    expect(model.lanes).toHaveLength(1);
    expect(model.lanes[0].planeId).toBe('work-items');
    expect(model.bars[0].laneId).toBe('plane:lane:work-items');
  });
});

describe('mergeRoadmap', () => {
  it('keeps manual lanes and bars and refreshes plane items that were not edited', () => {
    const current = fresh();
    const withLane = addLane(current, 'Ideas');
    const manualLane = withLane.lanes[withLane.lanes.length - 1];
    const manual = addManualBar(
      withLane,
      manualLane.id,
      'Manual',
      '2026-04-01',
      '2026-04-03',
    );
    const renamed = updateBar(manual, 'plane:item-1', { title: 'Custom title' });

    const nextFresh = buildRoadmapFromPlane({
      projectId: 'project-1',
      grouping: 'modules',
      lanes: [
        { id: 'mod-a', title: 'Alpha renamed' },
        { id: 'mod-b', title: 'Beta' },
      ],
      items: [
        {
          id: 'item-1',
          title: 'APP-1 From Plane',
          start: '2026-01-06',
          end: '2026-01-22',
          laneKey: 'mod-a',
        },
        {
          id: 'item-2',
          title: 'APP-2 Ship',
          start: '2026-02-02',
          end: '2026-02-08',
          laneKey: 'mod-b',
        },
      ],
    });

    const merged = mergeRoadmap(renamed, nextFresh);
    const planeBar = merged.bars.find((bar) => bar.planeId === 'item-1');
    const shipped = merged.bars.find((bar) => bar.planeId === 'item-2');
    const manualBar = merged.bars.find((bar) => bar.source === 'manual');
    expect(planeBar?.title).toBe('Custom title');
    expect(planeBar?.start).toBe('2026-01-05');
    expect(shipped?.title).toBe('APP-2 Ship');
    expect(shipped?.start).toBe('2026-02-02');
    expect(shipped?.kind).toBe('bar');
    expect(manualBar?.title).toBe('Manual');
    expect(merged.lanes.some((laneItem) => laneItem.title === 'Ideas')).toBe(true);
    expect(merged.lanes.find((laneItem) => laneItem.planeId === 'mod-a')?.title).toBe(
      'Alpha renamed',
    );
  });

  it('does not resurrect a plane bar the user deleted', () => {
    const current = removeBar(fresh(), 'plane:item-1');
    const merged = mergeRoadmap(current, fresh());
    expect(merged.bars.some((bar) => bar.planeId === 'item-1')).toBe(false);
    expect(merged.removedPlaneIds).toContain('item-1');
  });

  it('does not resurrect a plane lane or its bars after the lane is deleted', () => {
    const current = removeLane(fresh(), 'plane:lane:mod-a');
    const merged = mergeRoadmap(current, fresh());
    expect(merged.lanes.some((lane) => lane.planeId === 'mod-a')).toBe(false);
    expect(merged.bars.some((bar) => bar.planeId === 'item-1')).toBe(false);
  });

  it('drops a plane bar that disappeared unless the user overrode it', () => {
    const current = updateBar(fresh(), 'plane:item-1', { title: 'Keep me' });
    const nextFresh = buildRoadmapFromPlane({
      projectId: 'project-1',
      grouping: 'modules',
      lanes: [{ id: 'mod-b', title: 'Beta' }],
      items: [],
    });
    const merged = mergeRoadmap(current, nextFresh);
    expect(merged.bars.find((bar) => bar.planeId === 'item-1')?.title).toBe('Keep me');
    expect(merged.bars.some((bar) => bar.planeId === 'item-2')).toBe(false);
  });
});

describe('parseRoadmapModel', () => {
  it('derives milestone from equal dates and drops a bar whose lane is missing', () => {
    const parsed = parseRoadmapModel({
      projectId: 'project-1',
      grouping: 'modules',
      zoom: 'weeks',
      lanes: [
        {
          id: 'manual:lane1',
          title: 'Ideas',
          source: 'manual',
          planeId: 'should-drop',
          overridden: true,
        },
      ],
      bars: [
        {
          id: 'manual:bar1',
          laneId: 'manual:lane1',
          title: 'Point',
          start: '2026-05-01',
          end: '2026-05-01',
          color: 'nope',
          kind: 'bar',
          source: 'manual',
          planeId: 'nope',
        },
        {
          id: 'manual:bar2',
          laneId: 'missing',
          title: 'Gone',
          start: '2026-05-01',
          end: '2026-05-03',
          color: '#112233',
          kind: 'bar',
          source: 'manual',
        },
      ],
      removedPlaneIds: ['item-9', 'item-9'],
    });
    expect(parsed?.lanes[0].planeId).toBeNull();
    expect(parsed?.bars).toHaveLength(1);
    expect(parsed?.bars[0]).toMatchObject({
      start: '2026-05-01',
      end: '2026-05-01',
      kind: 'milestone',
      planeId: null,
    });
    expect(parsed?.removedPlaneIds).toEqual(['item-9']);
    expect(parsed?.zoom).toBe('weeks');
  });

  it('returns null for a payload without a grouping', () => {
    expect(parseRoadmapModel({})).toBeNull();
    expect(parseRoadmapModel(null)).toBeNull();
  });
});
