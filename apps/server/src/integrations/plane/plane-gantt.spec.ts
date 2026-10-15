import { NormalizedPlaneTask, PlaneCycle, PlaneModule } from './plane.types';
import {
  buildPlaneGantt,
  exclusiveEnd,
  formatPlaneRoadmapMarker,
  parsePlaneRoadmapMarker,
} from './plane-gantt';

function task(overrides: Partial<NormalizedPlaneTask> = {}): NormalizedPlaneTask {
  return {
    id: 'task-1',
    sequenceId: 1,
    ref: 'APP-1',
    title: 'Design: API',
    url: 'https://plane.example/issues/task-1',
    priority: 'high',
    startDate: '2026-03-01',
    dueDate: '2026-03-01',
    updatedAt: null,
    stateId: null,
    stateName: null,
    stateGroup: null,
    stateColor: null,
    assignees: [],
    labels: [],
    cycleId: 'cycle-1',
    moduleIds: ['module-1'],
    ...overrides,
  };
}

describe('buildPlaneGantt', () => {
  const cycles: PlaneCycle[] = [
    {
      id: 'cycle-1',
      name: 'Sprint: One',
      startDate: '2026-03-01',
      endDate: '2026-03-14',
    },
    {
      id: 'cycle-2',
      name: 'Empty',
      startDate: null,
      endDate: null,
    },
  ];

  it('groups dated work items under cycles and escapes mermaid labels', () => {
    const chart = buildPlaneGantt({
      title: 'Roadmap: Q1',
      grouping: 'cycles',
      tasks: [
        task(),
        task({
          id: 'task-2',
          ref: null,
          title: 'No dates',
          startDate: null,
          dueDate: null,
          cycleId: 'cycle-1',
        }),
      ],
      cycles,
    });

    expect(chart.taskCount).toBe(2);
    expect(chart.mermaid).toContain('title Roadmap - Q1');
    expect(chart.mermaid).toContain('section Sprint - One');
    expect(chart.mermaid).toContain('Sprint - One :t1, 2026-03-01, 2026-03-14');
    expect(chart.mermaid).toContain('APP-1 Design - API :t2, 2026-03-01, 2026-03-02');
    expect(chart.mermaid).not.toContain('No dates');
    expect(chart.mermaid).not.toContain('section Empty');
  });

  it('charts only work items that have both start and due dates', () => {
    const chart = buildPlaneGantt({
      title: 'Plane',
      grouping: 'workItems',
      tasks: [
        task({ cycleId: null, title: 'Dated' }),
        task({ id: 'task-2', title: 'Open', startDate: '2026-04-01', dueDate: null }),
      ],
    });

    expect(chart.taskCount).toBe(1);
    expect(chart.mermaid).toContain('section Work items');
    expect(chart.mermaid).toContain('APP-1 Dated :t1, 2026-03-01, 2026-03-02');
  });

  it('groups work items under modules', () => {
    const modules: PlaneModule[] = [
      {
        id: 'module-1',
        name: 'Auth',
        startDate: '2026-03-01',
        targetDate: '2026-03-20',
      },
    ];
    const chart = buildPlaneGantt({
      title: 'Modules',
      grouping: 'modules',
      tasks: [task({ title: 'Login', startDate: '2026-03-02', dueDate: '2026-03-05' })],
      modules,
    });

    expect(chart.mermaid).toContain('section Auth');
    expect(chart.mermaid).toContain('Auth :t1, 2026-03-01, 2026-03-20');
    expect(chart.mermaid).toContain('APP-1 Login :t2, 2026-03-02, 2026-03-05');
  });

  it('returns an empty chart when nothing has dates', () => {
    const chart = buildPlaneGantt({
      title: 'Empty',
      grouping: 'workItems',
      tasks: [task({ startDate: null, dueDate: null })],
    });
    expect(chart).toEqual({ mermaid: '', taskCount: 0 });
  });
});

describe('plane roadmap marker', () => {
  it('round-trips the regenerate marker', () => {
    const marker = formatPlaneRoadmapMarker('project-1', 'cycles');
    expect(parsePlaneRoadmapMarker(`${marker}\ngantt`)).toEqual({
      projectId: 'project-1',
      grouping: 'cycles',
    });
    expect(parsePlaneRoadmapMarker('gantt')).toBeNull();
  });

  it('extends a zero-length bar by one day', () => {
    expect(exclusiveEnd('2026-03-01', '2026-03-01')).toBe('2026-03-02');
    expect(exclusiveEnd('2026-03-01', '2026-03-04')).toBe('2026-03-04');
  });
});
