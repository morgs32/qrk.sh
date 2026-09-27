import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import {
  game,
  playX,
} from '@zerospin/fixtures/system-worker/workerd/automationFixture';
import { Effect, Exit, Fiber, Schema } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aggregateVersionChainDbConfig } from '../../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import { applyExecutedCommands } from '../applyExecutedCommands/applyExecutedCommands.js';
import { stageActorCommands } from '../optimistic/stageActorCommands.js';
import { makeActorSnapshotDb } from '../validateCommands/makeActorSnapshotDb.js';

import { makeActorAutomations } from './makeActorAutomations.js';

const control = vi.hoisted(() => ({
  decide: vi.fn(),
  stage: vi.fn(),
  afterStage: vi.fn(),
}));
vi.mock('config', async () => {
  const { makeSystem } =
    await import('@zerospin/core/system/make/makeSystem/makeSystem');
  const { makeSystemConfig } =
    await import('@zerospin/core/system/make/makeSystemConfig');
  const { automationGame, AutomationDecision } =
    await import('@zerospin/fixtures/system-worker/workerd/automationFixture');
  const { Effect, Layer } = await import('effect');
  return {
    default: makeSystemConfig(
      makeSystem({
        name: 'automations',
        aggregates: { automationGame: { '1.0.0': automationGame } },
        layer: Layer.succeed(AutomationDecision, value =>
          Effect.promise(() => control.decide(value)),
        ),
      }),
      { systemId: 'sys_automations' },
    ),
  };
});

const key = {
  systemId: 'sys_automations',
  aggregateId: 'acct_game',
  aggregateName: 'automationGame',
  aggregateVersion: '1.0.0',
  actorName: 'human',
  actorVersion: '1.0.0',
  actorPath: '/acct_game/gam_selected',
};
const tables = aggregateActorVersionRepoDbConfig.schema;
const now = new Date('2026-09-24T00:00:00Z');
const resource = (value: number, id = 'gam_selected') => ({
  id,
  modelName: 'automationGame',
  version: '1.0.0',
  createdAt: now,
  updatedAt: now,
  turn: 'O',
  value,
});
const row = (
  index: number,
  options: {
    id?: string;
    changed?: boolean;
    failed?: boolean;
    deleted?: boolean;
    value?: number;
  } = {},
) =>
  Schema.encodeSync(
    aggregateVersionChainDbConfig.tables.aggregateCommands.codec,
  )({
    id: `cmd_trigger${index}`,
    commandName: playX.commandName,
    contractVersion: playX.version,
    payload: JSON.stringify({
      id: options.id ?? 'gam_selected',
      value: options.value ?? index,
    }),
    ...key,
    systemName: 'automations',
    claims: {
      aggregateId: key.aggregateId,
      instanceId: options.id ?? 'gam_selected',
    },
    nodeId: null,
    sessionName: null,
    nodeIndex: null,
    automationName: null,
    admission: { status: 'succeeded', startedAt: now, completedAt: now },
    dispositionHash: index.toString(16).padStart(64, '0'),
    execution: options.failed
      ? {
          status: 'failed',
          startedAt: now,
          completedAt: now,
          failure: {
            _tag: 'ZerospinError',
            code: 'failed',
            message: 'failed',
            status: null,
            extra: null,
          },
        }
      : {
          status: 'succeeded',
          startedAt: now,
          completedAt: now,
          executionDelta: {
            inserted: [],
            updated:
              options.changed === false || options.failed || options.deleted
                ? []
                : [resource(options.value ?? index, options.id)],
            deleted: options.deleted
              ? [{ ...resource(index, options.id), deletedAt: now }]
              : [],
          },
        },
    executedIndex: index,
    aggregateIndex: index,
    executionVersion: '1.0.0',
  });
const fixture = (actorName = 'human') =>
  Effect.gen(function* () {
    const localKey = { ...key, actorName };
    const scratch = yield* makeActorSnapshotDb(
      makeResourceDbConfig({
        models: { automationGame: game },
        otherTables: aggregateActorVersionRepoDbConfig.tables,
      }),
    );
    const automations = makeActorAutomations({
      db: scratch.db,
      key: localKey,
      stageOutputs: ({ commands, executedIndex }) => {
        control.stage(commands);
        return stageActorCommands({
          db: scratch.db,
          key: localKey,
          commands,
          automationExecutedIndex: executedIndex,
        }).pipe(
          Effect.scoped,
          Effect.tap(() => Effect.sync(() => control.afterStage())),
          Effect.mapError(error =>
            isZerospinError(error)
              ? error
              : makeZerospinError({
                  code: 'actor-staging-failed',
                  cause: String(error),
                }),
          ),
        );
      },
    });
    const apply = (rows: ReturnType<typeof row>[]) =>
      Effect.forEach(rows, input =>
        Effect.gen(function* () {
          yield* applyExecutedCommands({
            rows: [input],
            db: scratch.db,
            key: localKey,
          });
          const captured = yield* automations.capture(input.executedIndex);
          yield* automations.runGroup(captured);
        }),
      ).pipe(Effect.asVoid);
    return { db: scratch.db, automations, apply };
  });
const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    import('@zerospin/core/async/Async').Async | import('effect').Scope.Scope
  >,
) => Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(AsyncLive)));

beforeEach(() => {
  control.decide.mockReset().mockImplementation(async (value: number) => value);
  control.stage.mockReset();
  control.afterStage.mockReset();
});

describe('gated actor automations', () => {
  it('retains a successful sibling output when another automation fails', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture('audited');
        yield* f.automations.initialize;
        yield* f.apply([row(1, { value: 3 })]);
        const reactions = f.db.select().from(tables.automationRuns).all();
        expect(
          reactions.find(reaction => reaction.automationName === 'audit'),
        ).toMatchObject({
          programStatus: 'failed',
          programFailure: expect.any(String),
        });
        expect(
          reactions.find(
            reaction => reaction.automationName === 'computerTurn',
          ),
        ).toMatchObject({
          programStatus: 'succeeded',
          stagingFailure: null,
        });
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
      }),
    );
  });

  it('holds the next confirmed command while concurrent siblings finish', async () => {
    let release!: (value: number) => void;
    control.decide.mockImplementationOnce(
      () =>
        new Promise<number>(resolve => {
          release = resolve;
        }),
    );
    await run(
      Effect.gen(function* () {
        const f = yield* fixture('audited');
        yield* f.automations.initialize;
        const pending = Effect.runPromise(
          f
            .apply([row(1), row(2)])
            .pipe(Effect.scoped, Effect.provide(AsyncLive)),
        );
        yield* Effect.promise(() =>
          vi.waitFor(() => {
            expect(control.decide).toHaveBeenCalledTimes(1);
            expect(
              f.db.select().from(tables.actorState).get()?.executedIndex,
            ).toBe(1);
            expect(
              f.db.select().from(tables.automationRuns).all(),
            ).toHaveLength(2);
          }),
        );
        expect(
          f.db
            .select()
            .from(tables.automationRuns)
            .all()
            .some(r => r.automationName === 'audit'),
        ).toBe(true);
        release(1);
        yield* Effect.promise(() => pending);
        expect(f.db.select().from(tables.actorState).get()?.executedIndex).toBe(
          2,
        );
        // The second automation observes the first automation's pending turn='X' update.
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(
          f.db
            .select()
            .from(tables.automationRuns)
            .all()
            .some(
              reaction =>
                reaction.executedIndex === 2 &&
                reaction.programStatus === 'empty',
            ),
        ).toBe(true);
        expect(
          f.db
            .select()
            .from(tables.automationGroups)
            .all()
            .every(g => g.status === 'staged'),
        ).toBe(true);
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
      }),
    );
  });

  it('marks started invocations interrupted after restart without running them', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.automations.initialize;
        yield* applyExecutedCommands({ rows: [row(1)], db: f.db, key });
        yield* f.automations.capture(1);
        expect(
          f.db.select().from(tables.automationRuns).get()?.programStatus,
        ).toBe('started');
        yield* f.automations.resume();
        expect(control.decide).not.toHaveBeenCalled();
        expect(
          f.db.select().from(tables.automationRuns).get()?.programStatus,
        ).toBe('interrupted');
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          0,
        );
      }),
    );
  });

  it('keeps a completed sibling while interrupting an invocation in flight', async () => {
    control.decide.mockImplementationOnce(() => new Promise<number>(() => {}));
    await run(
      Effect.gen(function* () {
        const f = yield* fixture('audited');
        yield* f.automations.initialize;
        yield* applyExecutedCommands({
          rows: [row(1)],
          db: f.db,
          key: { ...key, actorName: 'audited' },
        });
        const captured = yield* f.automations.capture(1);
        const fiber = yield* Effect.forkChild(f.automations.runGroup(captured));
        yield* Effect.promise(() =>
          vi.waitFor(() => {
            const runs = f.db.select().from(tables.automationRuns).all();
            expect(
              runs.find(run => run.automationName === 'audit'),
            ).toMatchObject({ programStatus: 'empty' });
            expect(
              runs.find(run => run.automationName === 'computerTurn'),
            ).toMatchObject({ programStatus: 'started' });
          }),
        );
        yield* Fiber.interrupt(fiber);
        yield* f.automations.resume();
        const runs = f.db.select().from(tables.automationRuns).all();
        expect(runs.find(run => run.automationName === 'audit')).toMatchObject({
          programStatus: 'empty',
        });
        expect(
          runs.find(run => run.automationName === 'computerTurn'),
        ).toMatchObject({ programStatus: 'interrupted' });
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
      }),
    );
  });

  it('recovers a projected group that crashed before snapshot capture', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.automations.initialize;
        yield* applyExecutedCommands({ rows: [row(1)], db: f.db, key });
        expect(
          f.db.select().from(tables.automationRuns).get()?.programStatus,
        ).toBe('pending');
        yield* f.automations.resume();
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(
          f.db.select().from(tables.automationRuns).get()?.programStatus,
        ).toBe('succeeded');
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
      }),
    );
  });

  it('retains a saved output across staging interruption and does not rerun its program', async () => {
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.automations.initialize;
        yield* applyExecutedCommands({ rows: [row(1)], db: f.db, key });
        const captured = yield* f.automations.capture(1);
        const reaction = captured.reactions[0];
        expect(reaction).toBeDefined();
        if (reaction === undefined) return;
        // A saved result is the recovery input, even if the invocation cannot be repeated.
        yield* f.automations.runGroup(captured);
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(
          f.db
            .select()
            .from(tables.commands)
            .all()
            .filter(row => row.automationName !== null),
        ).toHaveLength(1);
        f.db.update(tables.automationGroups).set({ status: 'open' }).run();
        yield* f.automations.resume();
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
      }),
    );
  });

  it('retries staging saved output after infrastructure failure', async () => {
    control.stage.mockImplementationOnce(() => {
      throw new Error('staging unavailable');
    });
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.automations.initialize;
        yield* applyExecutedCommands({ rows: [row(1)], db: f.db, key });
        const captured = yield* f.automations.capture(1);
        const first = yield* Effect.exit(f.automations.runGroup(captured));
        expect(Exit.isFailure(first)).toBe(true);
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(
          f.db
            .select()
            .from(tables.commands)
            .all()
            .filter(row => row.automationName !== null),
        ).toHaveLength(1);
        yield* f.automations.resume();
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(control.stage).toHaveBeenCalledTimes(2);
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
      }),
    );
  });

  it('reuses a staged command when the gate was not marked complete', async () => {
    control.afterStage.mockImplementationOnce(() => {
      throw new Error('gate completion unavailable');
    });
    await run(
      Effect.gen(function* () {
        const f = yield* fixture();
        yield* f.automations.initialize;
        yield* applyExecutedCommands({ rows: [row(1)], db: f.db, key });
        const captured = yield* f.automations.capture(1);
        const first = yield* Effect.exit(f.automations.runGroup(captured));
        expect(Exit.isFailure(first)).toBe(true);
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'open',
        );
        yield* f.automations.resume();
        expect(control.decide).toHaveBeenCalledTimes(1);
        expect(f.db.select().from(tables.pendingCommands).all()).toHaveLength(
          1,
        );
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
      }),
    );
  });
  it('records a thrown program defect without canceling its sibling', async () => {
    control.decide.mockImplementationOnce(() => {
      throw new Error('decision crashed');
    });
    await run(
      Effect.gen(function* () {
        const f = yield* fixture('audited');
        yield* f.automations.initialize;
        yield* f.apply([row(1)]);
        const runs = f.db.select().from(tables.automationRuns).all();
        expect(
          runs.find(run => run.automationName === 'computerTurn'),
        ).toMatchObject({ programStatus: 'failed' });
        expect(runs.find(run => run.automationName === 'audit')).toMatchObject({
          programStatus: 'empty',
        });
        expect(f.db.select().from(tables.automationGroups).get()?.status).toBe(
          'staged',
        );
      }),
    );
  });
});
