import {
  addLane,
  addManualBar,
  buildRoadmapFromPlane,
  mergeRoadmap,
  parseRoadmapModel,
  removeBar,
  removeLane,
  packRoadmapRows,
  setZoom,
  updateBar,
  zoomForSpan,
  zoomForWidth,
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
  it('builds module lanes and dated bars, and counts an item with no dates', () => {
    const model = fresh();
    expect(model.lanes.map((lane) => lane.planeId)).toEqual([
      'mod-a',
      'mod-b',
      'unassigned',
    ]);
    expect(model.bars.map((bar) => [bar.planeId, bar.kind, bar.laneId])).toEqual([
      ['item-1', 'bar', 'plane:lane:mod-a'],
      ['item-2', 'bar', 'plane:lane:unassigned'],
    ]);
    expect(model.unscheduledCount).toBe(1);
    expect(model.zoom).toBe('weeks');
    expect(model.zoomManual).toBe(false);
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
  it('keeps an explicit bar kind when the dates are equal and drops a bar whose lane is missing', () => {
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
      kind: 'bar',
      planeId: null,
    });
    expect(parsed?.removedPlaneIds).toEqual(['item-9']);
    expect(parsed?.zoom).toBe('weeks');
  });

  it('returns null for a payload without a grouping', () => {
    expect(parseRoadmapModel({})).toBeNull();
    expect(parseRoadmapModel(null)).toBeNull();
  });

  it('keeps one level of sub-lanes and drops a parent that is itself a child', () => {
    const parsed = parseRoadmapModel({
      grouping: 'modules',
      lanes: [
        { id: 'lane-a', title: 'A', source: 'manual' },
        { id: 'lane-b', title: 'B', source: 'manual', parentId: 'lane-a' },
        { id: 'lane-c', title: 'C', source: 'manual', parentId: 'lane-b' },
        { id: 'lane-d', title: 'D', source: 'manual', parentId: 'missing' },
      ],
      bars: [],
    });
    expect(parsed?.lanes.map((lane) => [lane.id, lane.parentId])).toEqual([
      ['lane-a', null],
      ['lane-b', 'lane-a'],
      ['lane-c', null],
      ['lane-d', null],
    ]);
  });

  it('drops dependency ids that do not exist and keeps a page link', () => {
    const parsed = parseRoadmapModel({
      grouping: 'modules',
      lanes: [{ id: 'lane-a', title: 'A', source: 'manual' }],
      bars: [
        {
          id: 'bar-a',
          laneId: 'lane-a',
          title: 'A',
          start: '2026-06-01',
          end: '2026-06-05',
          source: 'manual',
          dependsOn: ['bar-b', 'missing', 'bar-a'],
          link: { kind: 'page', href: '/s/san-pham/p/plan', label: 'Plan' },
        },
        {
          id: 'bar-b',
          laneId: 'lane-a',
          title: 'B',
          start: '2026-06-06',
          end: '2026-06-08',
          source: 'manual',
          dependsOn: ['bar-a'],
          link: { kind: 'plane', href: 'javascript:alert(1)', label: 'Bad' },
        },
      ],
    });
    expect(parsed?.bars.find((bar) => bar.id === 'bar-a')?.dependsOn).toEqual(['bar-b']);
    expect(parsed?.bars.find((bar) => bar.id === 'bar-a')?.link).toEqual({
      kind: 'page',
      href: '/s/san-pham/p/plan',
      label: 'Plan',
    });
    expect(parsed?.bars.find((bar) => bar.id === 'bar-b')?.dependsOn).toEqual(['bar-a']);
    expect(parsed?.bars.find((bar) => bar.id === 'bar-b')?.link).toBeNull();
  });
});

describe('mergeRoadmap zoom', () => {
  it('keeps a manual zoom and takes the fresh zoom when zoom was automatic', () => {
    const next = { ...fresh(), zoom: 'months' as const };
    expect(mergeRoadmap(fresh(), next).zoom).toBe('months');
    expect(mergeRoadmap(fresh(), next).zoomManual).toBe(false);
    const manual = mergeRoadmap(setZoom(fresh(), 'quarters'), next);
    expect(manual.zoom).toBe('quarters');
    expect(manual.zoomManual).toBe(true);
    expect(manual.unscheduledCount).toBe(1);
  });
});

describe('zoomForWidth', () => {
  it('picks the finest zoom whose span and labels fit, and quarters when nothing fits', () => {
    expect(zoomForWidth(29, 180, 3000)).toBe('days');
    expect(zoomForWidth(29, 180, 1400)).toBe('weeks');
    expect(zoomForWidth(29, 180, 500)).toBe('months');
    expect(zoomForWidth(400, 180, 200)).toBe('quarters');
  });
});

describe('zoomForSpan', () => {
  it('uses weeks for a few weeks, months for a year, and quarters past a year', () => {
    expect(zoomForSpan('2026-10-15', '2026-11-13')).toBe('weeks');
    expect(zoomForSpan('2026-01-01', '2026-12-01')).toBe('months');
    expect(zoomForSpan('2024-01-01', '2026-06-01')).toBe('quarters');
  });
});

describe('packRoadmapRows', () => {
  it('puts bars that share a day on different rows and lets the next day reuse a free row', () => {
    const packed = packRoadmapRows(
      ['lane-a', 'lane-b'],
      [
        { id: 'a1', laneId: 'lane-a', start: '2026-10-15', end: '2026-10-15' },
        { id: 'a2', laneId: 'lane-a', start: '2026-10-15', end: '2026-10-15' },
        { id: 'a3', laneId: 'lane-a', start: '2026-10-16', end: '2026-10-18' },
        { id: 'b1', laneId: 'lane-b', start: '2026-11-03', end: '2026-11-05' },
      ],
    );
    const a1 = packed.bars.find((bar) => bar.id === 'a1');
    const a2 = packed.bars.find((bar) => bar.id === 'a2');
    const a3 = packed.bars.find((bar) => bar.id === 'a3');
    const b1 = packed.bars.find((bar) => bar.id === 'b1');
    const laneA = packed.lanes.find((lane) => lane.id === 'lane-a');
    expect(a1 && a2 && a1.laneRow !== a2.laneRow).toBe(true);
    expect(a3?.laneRow).toBe(a1?.laneRow);
    expect(laneA?.rowCount).toBe(2);
    expect(b1?.row).toBe((laneA?.rowStart ?? 0) + (laneA?.rowCount ?? 0));
  });

  it('puts a bar on the next row when the previous label still covers its start', () => {
    const packed = packRoadmapRows(
      ['lane-a'],
      [
        { id: 'a1', laneId: 'lane-a', start: '2026-10-15', end: '2026-10-15', labelPx: 180 },
        { id: 'a2', laneId: 'lane-a', start: '2026-10-17', end: '2026-10-17', labelPx: 180 },
        { id: 'a3', laneId: 'lane-a', start: '2026-11-03', end: '2026-11-05', labelPx: 0 },
      ],
      36,
    );
    const a1 = packed.bars.find((bar) => bar.id === 'a1');
    const a2 = packed.bars.find((bar) => bar.id === 'a2');
    const a3 = packed.bars.find((bar) => bar.id === 'a3');
    expect(a1 && a2 && a1.laneRow !== a2.laneRow).toBe(true);
    expect(a3?.laneRow).toBe(a1?.laneRow);
  });
});
