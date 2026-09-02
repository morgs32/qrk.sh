import { abortAllDurableObjects, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('E Pluribus Machina Workerd compatibility', () => {
  it('saves through exact SQLite CAS, publishes the Handle, and cold-reconstructs transformed State values', async () => {
    const name = 'epm-workerd-gate/success';
    const transitioned =
      await env.E_PLURIBUS_MACHINA_FIXTURE.getByName(
        name,
      ).transitionAndInspect();

    expect(transitioned).toEqual({
      initialStateName: 'allocated',
      initialDateIsDate: true,
      selectedStateName: 'selected',
      selectedDateIsDate: true,
      selectedAt: '2026-08-29T12:00:00.000Z',
      selectedMatchesOwnSchema: true,
      selectedMatchesUnionSchema: true,
      publishedHandleIsReturnedHandle: true,
      roundTrippedDateIsDate: true,
      roundTrippedSelectedAt: '2026-08-29T12:00:00.000Z',
      savedOriginJson:
        '{"stateName":"allocated","deployId":"deploy-epm-workerd-gate","allocatedAt":"2026-08-29T12:00:00.000Z"}',
      savedDestinationJson:
        '{"stateName":"selected","deployId":"deploy-epm-workerd-gate","selectedAt":"2026-08-29T12:00:00.000Z"}',
      saveRowsWritten: 1,
      persistedRevision: 1,
      persistedStateJson:
        '{"stateName":"selected","deployId":"deploy-epm-workerd-gate","selectedAt":"2026-08-29T12:00:00.000Z"}',
    });

    await abortAllDurableObjects();

    const reconstructed =
      await env.E_PLURIBUS_MACHINA_FIXTURE.getByName(
        name,
      ).inspectColdReconstruction();
    expect(reconstructed).toEqual({
      stateName: 'selected',
      selectedDateIsDate: true,
      selectedAt: '2026-08-29T12:00:00.000Z',
      matchesOwnSchema: true,
      matchesUnionSchema: true,
      encodedStateJson:
        '{"stateName":"selected","deployId":"deploy-epm-workerd-gate","selectedAt":"2026-08-29T12:00:00.000Z"}',
      persistedStateJson:
        '{"stateName":"selected","deployId":"deploy-epm-workerd-gate","selectedAt":"2026-08-29T12:00:00.000Z"}',
      persistedRevision: 1,
    });
  });

  it('defects the stale Actor on a zero-row CAS without publishing its destination Handle', async () => {
    const inspected = await env.E_PLURIBUS_MACHINA_FIXTURE.getByName(
      'epm-workerd-gate/stale',
    ).rejectStaleSave();

    expect(inspected).toEqual({
      externalRowsWritten: 1,
      commandFailed: true,
      failureText: expect.stringContaining(
        'E Pluribus Machina fixture stale State CAS wrote zero rows',
      ),
      saveRowsWritten: 0,
      retainedHandleIsOriginal: true,
      retainedStateName: 'allocated',
      persistedRevision: 1,
      persistedStateJson:
        '{"stateName":"allocated","deployId":"deploy-epm-workerd-gate","allocatedAt":"2026-08-29T12:00:00.000Z"}',
      initialStateJson:
        '{"stateName":"allocated","deployId":"deploy-epm-workerd-gate","allocatedAt":"2026-08-29T12:00:00.000Z"}',
    });
  });
});
