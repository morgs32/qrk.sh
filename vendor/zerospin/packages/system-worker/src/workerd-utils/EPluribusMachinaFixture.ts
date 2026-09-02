import { DurableObject } from 'cloudflare:workers';
import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Schema,
} from 'effect';
import { makeActor } from 'epluribus-machina/makeActor';
import { makeMachine } from 'epluribus-machina/makeMachine';
import { makeState } from 'epluribus-machina/makeState';

const Allocated = makeState({
  stateName: 'allocated',
  input: {
    deployId: Schema.String,
    allocatedAt: Schema.DateFromString,
  },
});

const Selected = makeState({
  stateName: 'selected',
  input: {
    deployId: Schema.String,
    selectedAt: Schema.DateFromString,
  },
});

const machineStateSchema = Schema.Union([Allocated.schema, Selected.schema]);

const initialState = Allocated.make({
  deployId: 'deploy-epm-workerd-gate',
  allocatedAt: new Date('2026-08-29T12:00:00.000Z'),
});

const initialStateJson = JSON.stringify(
  Schema.encodeUnknownSync(machineStateSchema)(initialState),
);

export class EPluribusMachinaFixture extends DurableObject {
  async transitionAndInspect() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ePluribusMachinaState (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        revision INTEGER NOT NULL,
        stateJson TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO ePluribusMachinaState
        (singleton, revision, stateJson) VALUES (1, 0, ?)`,
      initialStateJson,
    );
    const [stored] = [
      ...this.ctx.storage.sql.exec<{
        revision: number;
        stateJson: string;
      }>(
        'SELECT revision, stateJson FROM ePluribusMachinaState WHERE singleton = 1',
      ),
    ];
    if (stored === undefined) {
      throw new Error('E Pluribus Machina fixture State row is missing');
    }

    const decodedInitial = Schema.decodeUnknownSync(machineStateSchema)(
      JSON.parse(stored.stateJson),
    );
    const machine = makeMachine({
      states: { allocated: Allocated, selected: Selected },
      initial: decodedInitial,
      routes: {
        allocated: {
          commands: {
            select: {
              payload: Schema.Void,
              program: Effect.fn('allocated.select')(function* ({ origin }) {
                yield* Effect.void;
                return Selected.make({
                  deployId: origin.deployId,
                  selectedAt: origin.allocatedAt,
                });
              }),
            },
          },
        },
      },
    });
    const runtime = ManagedRuntime.make(Layer.empty);
    let expectedRevision = stored.revision;
    let saveRowsWritten: number | null = null;
    let savedOriginJson: string | null = null;
    let savedDestinationJson: string | null = null;
    const actor = makeActor(machine, {
      runtime,
      save: ({ origin, destination }) =>
        Effect.sync(() => {
          savedOriginJson = JSON.stringify(
            Schema.encodeUnknownSync(machineStateSchema)(origin),
          );
          savedDestinationJson = JSON.stringify(
            Schema.encodeUnknownSync(machineStateSchema)(destination),
          );
          const update = this.ctx.storage.sql.exec(
            `UPDATE ePluribusMachinaState
              SET revision = revision + 1, stateJson = ?
              WHERE singleton = 1 AND revision = ? AND stateJson = ?`,
            savedDestinationJson,
            expectedRevision,
            savedOriginJson,
          );
          saveRowsWritten = update.rowsWritten;
          if (saveRowsWritten !== 1) {
            throw new Error(
              'E Pluribus Machina fixture stale State CAS wrote zero rows',
            );
          }
          expectedRevision += 1;
        }),
    });
    const owner = actor.start();

    try {
      return await runtime.runPromise(
        Effect.gen(
          function* () {
            yield* actor.ready();
            const allocated = yield* actor.getHandle();
            if (allocated.stateName !== 'allocated') {
              return yield* Effect.die(
                new Error('Expected reconstructed allocated Handle'),
              );
            }
            const selected = yield* allocated.commands.select();
            const published = yield* actor.getHandle();
            const [persisted] = [
              ...this.ctx.storage.sql.exec<{
                revision: number;
                stateJson: string;
              }>(
                'SELECT revision, stateJson FROM ePluribusMachinaState WHERE singleton = 1',
              ),
            ];
            if (persisted === undefined) {
              return yield* Effect.die(
                new Error('Persisted selected State row is missing'),
              );
            }
            const encodedSelected =
              Schema.encodeUnknownSync(machineStateSchema)(selected);
            const roundTrippedSelected =
              Schema.decodeUnknownSync(machineStateSchema)(encodedSelected);
            if (roundTrippedSelected.stateName !== 'selected') {
              return yield* Effect.die(
                new Error('Expected round-tripped selected State'),
              );
            }

            return {
              initialStateName: allocated.stateName,
              initialDateIsDate: allocated.allocatedAt instanceof Date,
              selectedStateName: selected.stateName,
              selectedDateIsDate: selected.selectedAt instanceof Date,
              selectedAt: selected.selectedAt.toISOString(),
              selectedMatchesOwnSchema: Schema.is(Selected.schema)(selected),
              selectedMatchesUnionSchema:
                Schema.is(machineStateSchema)(selected),
              publishedHandleIsReturnedHandle: published === selected,
              roundTrippedDateIsDate:
                roundTrippedSelected.selectedAt instanceof Date,
              roundTrippedSelectedAt:
                roundTrippedSelected.selectedAt.toISOString(),
              savedOriginJson,
              savedDestinationJson,
              saveRowsWritten,
              persistedRevision: persisted.revision,
              persistedStateJson: persisted.stateJson,
            };
          }.bind(this),
        ),
      );
    } finally {
      await runtime.runPromise(Fiber.interrupt(owner));
      await runtime.dispose();
    }
  }

  async inspectColdReconstruction() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ePluribusMachinaState (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        revision INTEGER NOT NULL,
        stateJson TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO ePluribusMachinaState
        (singleton, revision, stateJson) VALUES (1, 0, ?)`,
      initialStateJson,
    );
    const [stored] = [
      ...this.ctx.storage.sql.exec<{
        revision: number;
        stateJson: string;
      }>(
        'SELECT revision, stateJson FROM ePluribusMachinaState WHERE singleton = 1',
      ),
    ];
    if (stored === undefined) {
      throw new Error('E Pluribus Machina fixture State row is missing');
    }

    const decodedInitial = Schema.decodeUnknownSync(machineStateSchema)(
      JSON.parse(stored.stateJson),
    );
    const machine = makeMachine({
      states: { allocated: Allocated, selected: Selected },
      initial: decodedInitial,
      routes: {
        allocated: {
          commands: {
            select: {
              payload: Schema.Void,
              program: Effect.fn('allocated.select')(function* ({ origin }) {
                yield* Effect.void;
                return Selected.make({
                  deployId: origin.deployId,
                  selectedAt: origin.allocatedAt,
                });
              }),
            },
          },
        },
      },
    });
    const runtime = ManagedRuntime.make(Layer.empty);
    const actor = makeActor(machine, { runtime });
    const owner = actor.start();

    try {
      return await runtime.runPromise(
        Effect.gen(function* () {
          yield* actor.ready();
          const reconstructed = yield* actor.getHandle();
          if (reconstructed.stateName !== 'selected') {
            return yield* Effect.die(
              new Error('Expected cold-reconstructed selected Handle'),
            );
          }
          const encoded =
            Schema.encodeUnknownSync(machineStateSchema)(reconstructed);
          return {
            stateName: reconstructed.stateName,
            selectedDateIsDate: reconstructed.selectedAt instanceof Date,
            selectedAt: reconstructed.selectedAt.toISOString(),
            matchesOwnSchema: Schema.is(Selected.schema)(reconstructed),
            matchesUnionSchema: Schema.is(machineStateSchema)(reconstructed),
            encodedStateJson: JSON.stringify(encoded),
            persistedStateJson: stored.stateJson,
            persistedRevision: stored.revision,
          };
        }),
      );
    } finally {
      await runtime.runPromise(Fiber.interrupt(owner));
      await runtime.dispose();
    }
  }

  async rejectStaleSave() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ePluribusMachinaState (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        revision INTEGER NOT NULL,
        stateJson TEXT NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO ePluribusMachinaState
        (singleton, revision, stateJson) VALUES (1, 0, ?)`,
      initialStateJson,
    );
    const [stored] = [
      ...this.ctx.storage.sql.exec<{
        revision: number;
        stateJson: string;
      }>(
        'SELECT revision, stateJson FROM ePluribusMachinaState WHERE singleton = 1',
      ),
    ];
    if (stored === undefined) {
      throw new Error('E Pluribus Machina fixture State row is missing');
    }

    const decodedInitial = Schema.decodeUnknownSync(machineStateSchema)(
      JSON.parse(stored.stateJson),
    );
    const machine = makeMachine({
      states: { allocated: Allocated, selected: Selected },
      initial: decodedInitial,
      routes: {
        allocated: {
          commands: {
            select: {
              payload: Schema.Void,
              program: Effect.fn('allocated.select')(function* ({ origin }) {
                yield* Effect.void;
                return Selected.make({
                  deployId: origin.deployId,
                  selectedAt: origin.allocatedAt,
                });
              }),
            },
          },
        },
      },
    });
    const runtime = ManagedRuntime.make(Layer.empty);
    let saveRowsWritten: number | null = null;
    const actor = makeActor(machine, {
      runtime,
      save: ({ origin, destination }) =>
        Effect.sync(() => {
          const encodedOrigin = JSON.stringify(
            Schema.encodeUnknownSync(machineStateSchema)(origin),
          );
          const encodedDestination = JSON.stringify(
            Schema.encodeUnknownSync(machineStateSchema)(destination),
          );
          const update = this.ctx.storage.sql.exec(
            `UPDATE ePluribusMachinaState
              SET revision = revision + 1, stateJson = ?
              WHERE singleton = 1 AND revision = ? AND stateJson = ?`,
            encodedDestination,
            stored.revision,
            encodedOrigin,
          );
          saveRowsWritten = update.rowsWritten;
          if (saveRowsWritten !== 1) {
            throw new Error(
              'E Pluribus Machina fixture stale State CAS wrote zero rows',
            );
          }
        }),
    });
    const owner = actor.start();

    try {
      return await runtime.runPromise(
        Effect.gen(
          function* () {
            yield* actor.ready();
            const allocated = yield* actor.getHandle();
            if (allocated.stateName !== 'allocated') {
              return yield* Effect.die(
                new Error('Expected reconstructed allocated Handle'),
              );
            }
            const externalUpdate = this.ctx.storage.sql.exec(
              `UPDATE ePluribusMachinaState
              SET revision = revision + 1
              WHERE singleton = 1 AND revision = ?`,
              stored.revision,
            );
            const commandExit = yield* Effect.exit(allocated.commands.select());
            const retained = yield* actor.getHandle();
            const [persisted] = [
              ...this.ctx.storage.sql.exec<{
                revision: number;
                stateJson: string;
              }>(
                'SELECT revision, stateJson FROM ePluribusMachinaState WHERE singleton = 1',
              ),
            ];
            if (persisted === undefined) {
              return yield* Effect.die(
                new Error('Persisted stale State row is missing'),
              );
            }

            return {
              externalRowsWritten: externalUpdate.rowsWritten,
              commandFailed: Exit.isFailure(commandExit),
              failureText: Exit.isFailure(commandExit)
                ? Cause.pretty(commandExit.cause)
                : null,
              saveRowsWritten,
              retainedHandleIsOriginal: retained === allocated,
              retainedStateName: retained.stateName,
              persistedRevision: persisted.revision,
              persistedStateJson: persisted.stateJson,
              initialStateJson,
            };
          }.bind(this),
        ),
      );
    } finally {
      await runtime.runPromise(Fiber.interrupt(owner));
      await runtime.dispose();
    }
  }
}
