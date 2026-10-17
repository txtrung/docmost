import { buildWorkItemPayload, normalizePerson } from './plane-normalize';

describe('normalizePerson', () => {
  it('keeps an http avatar and drops any other scheme', () => {
    expect(
      normalizePerson({
        id: 'user-1',
        email: 'lan@example.com',
        display_name: 'Lan',
        avatar_url: 'https://cdn.example/lan.png',
      })?.avatarUrl,
    ).toBe('https://cdn.example/lan.png');

    expect(
      normalizePerson({
        id: 'user-2',
        email: 'a@example.com',
        avatar: 'javascript:alert(1)',
      })?.avatarUrl,
    ).toBeNull();
  });
});

describe('buildWorkItemPayload', () => {
  it('sends only the fields the caller set', () => {
    expect(
      buildWorkItemPayload({
        title: ' Write the spec ',
        stateId: 'state-1',
        priority: 'high',
        assigneeId: 'user-1',
      }),
    ).toEqual({
      name: 'Write the spec',
      state: 'state-1',
      priority: 'high',
      assignees: ['user-1'],
    });
    expect(buildWorkItemPayload({ title: 'Only a title' })).toEqual({
      name: 'Only a title',
    });
  });
});
