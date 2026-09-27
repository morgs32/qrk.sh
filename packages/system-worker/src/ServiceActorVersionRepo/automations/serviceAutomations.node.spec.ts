import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeZerospinError } from '@zerospin/error';
import { serviceAutomation } from '@zerospin/fixtures/system-worker/workerd/serviceAutomation';
import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { serviceActorVersionRepoDbConfig } from '../serviceActorVersionRepoDbConfig.js';

import { makeServiceAutomations } from './makeServiceAutomations.js';

const observations = vi.hoisted(() => ({
  statuses: [] as (string | undefined)[],
}));

vi.mock('config', async () => {
  const { makeAutomation } =
    await import('@zerospin/core/automation/makeAutomation');
  const { makeService } =
    await import('@zerospin/core/service/make/makeService');
  const original = serviceAutomation.versions['1.0.0'];
  const automation = original.automations.finishStartedJob;
  const observedService = makeService({
    name: 'serviceAutomation',
    module: {
      '1.0.0': {
        models: original.models,
        contracts: original.contracts,
        automations: {
          finishStartedJob: makeAutomation({
            ...automation,
            program: props => {
              observations.statuses.push(
                props.db.query.job.findFirst().sync()?.status,
              );
              return automation.program(props);
            },
          }),
        },
      },
    },
  });
  const { makeSystem } =
    await import('@zerospin/core/system/make/makeSystem/makeSystem');
  const { makeSystemConfig } =
    await import('@zerospin/core/system/make/makeSystemConfig');
  return {
    default: makeSystemConfig(
      makeSystem({
        name: 'service-recovery',
        aggregates: {},
        services: { serviceAutomation: observedService },
        layer: Layer.empty,
      }),
      { systemId: 'sys_service_recovery' },
    ),
  };
});

const tables = serviceActorVersionRepoDbConfig.schema;
const key = {
  systemId: 'sys_service_recovery',
  serviceName: 'serviceAutomation',
  serviceVersion: '1.0.0',
  actorName: '__service',
  actorVersion: '1.0.0',
  actorPath: '/',
};
const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    import('@zerospin/core/async/Async').Async | import('effect').Scope.Scope
  >,
) => Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(AsyncLive)));

const fixture = (stageOutput = false) =>
  Effect.gen(function* () {
    const service = serviceAutomation.versions['1.0.0'];
    const scratch = yield* makeActorSnapshotDb(
      makeResourceDbConfig({
        models: service.models,
        otherTables: serviceActorVersionRepoDbConfig.tables,
      }),
    );
    const db = scratch.db;
    if (stageOutput) {
      const now = new Date('2026-09-26T00:00:00Z');
      const resource = {
        id: 'job_service_recovery',
        modelName: 'job',
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        status: 'started',
      };
      db.insert(service.models.job.drizzleSchema).values(resource).run();
    }
    db.insert(tables.automationGroups)
      .values({ serviceIndex: 1, status: 'open' })
      .run();
    db.insert(tables.automationRuns)
      .values({
        serviceIndex: 1,
        automationName: 'finishStartedJob',
        programStatus: 'pending',
        outputCommandRowId: null,
        programFailure: null,
        stagingFailure: null,
      })
      .run();
    db.insert(tables.commands)
      .values(
        yield* serviceActorVersionRepoDbConfig.tables.commands.encodeRow({
          rowId: 'row_service_trigger',
          id: 'cmd_service_trigger',
          commandName: 'startJob',
          contractVersion: '1.0.0',
          payload: JSON.stringify({ id: 'job_service_recovery' }),
          serviceName: key.serviceName,
          serviceVersion: key.serviceVersion,
          automationName: null,
          serviceIndex: 1,
          admission: null,
          execution: null,
          dispositionHash: null,
          actorServiceIndex: null,
          serviceHash: null,
          actorDelta: null,
          acknowledgedAt: null,
          lastDeliveryFailure: null,
        }),
      )
      .run();
    let automations!: ReturnType<typeof makeServiceAutomations>;
    const stageOutputs = vi.fn((serviceIndex: number) =>
      stageOutput
        ? automations.stage(serviceIndex).pipe(
            Effect.scoped,
            Effect.mapError(error =>
              makeZerospinError({
                code: 'test-staging-failed',
                cause: String(error),
              }),
            ),
          )
        : Effect.void,
    );
    automations = makeServiceAutomations({ db, key, stageOutputs });
    return { db, automations, stageOutputs };
  });

describe('service automation recovery', () => {
  it('starts a pending invocation after restart and saves its output', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.automations.resume();
        expect(f.db.select().from(tables.automationRuns).get()).toMatchObject({
          programStatus: 'succeeded',
          outputCommandRowId: expect.any(String),
        });
        expect(f.stageOutputs).toHaveBeenCalledExactlyOnceWith(1);
      }),
    );
  });

  it('interrupts a started invocation without running its program again', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        f.db
          .update(tables.automationRuns)
          .set({ programStatus: 'started' })
          .run();
        yield* f.automations.resume();
        expect(f.db.select().from(tables.automationRuns).get()).toMatchObject({
          programStatus: 'interrupted',
          outputCommandRowId: null,
        });
        expect(
          f.db
            .select()
            .from(tables.commands)
            .all()
            .filter(row => row.automationName),
        ).toHaveLength(0);
        expect(f.stageOutputs).toHaveBeenCalledExactlyOnceWith(1);
      }),
    );
  });

  it('preserves a saved command instead of invoking the program again', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.automations.resume();
        const saved = f.db.select().from(tables.automationRuns).get();
        expect(saved?.outputCommandRowId).toEqual(expect.any(String));
        f.stageOutputs.mockClear();
        yield* f.automations.resume();
        expect(
          f.db.select().from(tables.automationRuns).get()?.outputCommandRowId,
        ).toBe(saved?.outputCommandRowId);
        expect(
          f.db
            .select()
            .from(tables.commands)
            .all()
            .filter(row => row.automationName),
        ).toHaveLength(1);
        expect(f.stageOutputs).toHaveBeenCalledExactlyOnceWith(1);
      }),
    );
  });

  it('reuses saved output after staging infrastructure fails', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        f.stageOutputs.mockImplementationOnce(() =>
          Effect.die(new Error('staging unavailable')),
        );
        const first = yield* Effect.exit(f.automations.run(1));
        expect(Exit.isFailure(first)).toBe(true);
        const saved = f.db.select().from(tables.automationRuns).get();
        expect(saved).toMatchObject({
          programStatus: 'succeeded',
          outputCommandRowId: expect.any(String),
        });
        yield* f.automations.resume();
        expect(
          f.db.select().from(tables.automationRuns).get()?.outputCommandRowId,
        ).toBe(saved?.outputCommandRowId);
        expect(
          f.db
            .select()
            .from(tables.commands)
            .all()
            .filter(row => row.automationName),
        ).toHaveLength(1);
        expect(f.stageOutputs).toHaveBeenCalledTimes(2);
      }),
    );
  });

  it('keeps one pending command when staging completed before the gate', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture(true);
        yield* f.automations.resume();
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
        f.db.update(tables.automationGroups).set({ status: 'open' }).run();
        yield* f.automations.resume();
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
        expect(f.stageOutputs).toHaveBeenCalledTimes(2);
      }),
    );
  });
  it('captures earlier staged output before the next group is confirmed', async () => {
    await run(
      Effect.gen(function* () {
        observations.statuses.length = 0;
        const f = yield* fixture(true);
        yield* f.automations.resume();
        expect(observations.statuses).toEqual(['started']);
        const trigger = f.db
          .select()
          .from(tables.commands)
          .all()
          .find(row => row.serviceIndex === 1)!;
        f.db
          .insert(tables.commands)
          .values({
            ...trigger,
            rowId: 'row_second',
            id: 'cmd_second',
            serviceIndex: 2,
          })
          .run();
        f.db
          .insert(tables.automationGroups)
          .values({ serviceIndex: 2, status: 'open' })
          .run();
        f.db
          .insert(tables.automationRuns)
          .values({
            serviceIndex: 2,
            automationName: 'finishStartedJob',
            programStatus: 'pending',
            outputCommandRowId: null,
            programFailure: null,
            stagingFailure: null,
          })
          .run();
        yield* f.automations.run(2);
        expect(observations.statuses).toEqual(['started', 'finished']);
        expect(
          f.db
            .select()
            .from(serviceAutomation.versions['1.0.0'].models.job.drizzleSchema)
            .get(),
        ).toMatchObject({ status: 'started' });
      }),
    );
  });
});
