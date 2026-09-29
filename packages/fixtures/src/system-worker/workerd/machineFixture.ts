import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { MachineClaimsSchema } from '@zerospin/core/machine/MachineClaimsSchema';
import { defineModel } from '@zerospin/core/models/defineModel';
import { captureActorSelections, makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { ContractError } from '@zerospin/error';
import { execute, makeMachine } from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import { makeAbbreviationIdSchema, primitives } from '@zerospin/schema';
import { Context, Effect, Schema } from 'effect';

export const game = makeModelVersion(
  defineModel({ name: 'machineGame', abbreviation: 'gam' }),
  {
    version: '1.0.0',
    attributes: { turn: primitives.text(), value: primitives.integer() },
    indexes: [],
  },
);
const claimsSchema = Schema.Struct({
  aggregateId: Schema.String,
  instanceId: Schema.String,
});
const identity = makeActorIdentity({
  claims: claimsSchema,
  actorPath: RoutePattern.parse('/:aggregateId/:instanceId'),
});
const db = makeActorDbVersion({ models: { machineGame: game } });
const payload = {
  id: primitives.foreignKey({ abbreviation: 'gam' }),
  value: primitives.integer(),
};
export const createGame = makeContractVersion(
  defineContract('machineCreate'),
  {
    version: '1.0.0',
    models: { machineGame: game },
    payload,
    program: ({ models, payload }) =>
      models.machineGame
        .create({
          resourceId: payload.id,
          attributes: { value: payload.value, turn: 'X' },
        })
        .pipe(Effect.map(mutation => [mutation])),
  },
);
export const playX = makeContractVersion(defineContract('machinePlayX'), {
  version: '1.0.0',
  models: { machineGame: game },
  payload,
  program: ({ models, payload }) =>
    models.machineGame
      .update({
        resourceId: payload.id,
        attributes: { value: payload.value, turn: 'O' },
      })
      .pipe(Effect.map(mutation => [mutation])),
});
export const playO = makeContractVersion(defineContract('machinePlayO'), {
  version: '1.0.0',
  claims: MachineClaimsSchema,
  models: { machineGame: game },
  payload,
  failures: { stale: ContractError.schema({ code: 'stale' }) },
  guard: Effect.fn(function* ({ db, payload, failures }) {
    const row = db.query.machineGame
      .findFirst({ where: { id: { eq: payload.id } } })
      .sync();
    if (row?.turn !== 'O' || row.value !== payload.value) {
      return yield* failures.stale.make({ extra: null });
    }
  }),
  program: ({ models, payload }) =>
    models.machineGame
      .update({
        resourceId: payload.id,
        attributes: { turn: 'X' },
      })
      .pipe(Effect.map(mutation => [mutation])),
});
export class MachineDecision extends Context.Service<
  MachineDecision,
  (value: number) => Effect.Effect<number | null>
>()('tests/MachineDecision') {}
export const human = makeAggregateActorVersion(
  { name: 'human' },
  {
    authentication: 'none',
    version: '1.0.0',
    db,
    identity,
    queries: {
      machineGame: db.query.machineGame.findMany({
        where: { id: { eq: identity.sql.placeholder('instanceId') } },
      }),
    },
    contracts: { machineCreate: createGame, machinePlayX: playX },
  },
);
export const machineGame = makeAggregateVersion(
  { name: 'machineGame' },
  {
    version: '1.0.0',
    models: { machineGame: game },
    contracts: {
      machineCreate: createGame,
      machinePlayX: playX,
      machinePlayO: playO,
    },
    actors: { human },
  },
);

const Idle = makeState({ stateName: 'idle', input: {} });
const Deciding = makeState({
  stateName: 'deciding',
  input: { aggregateId: Schema.String, gameId: makeAbbreviationIdSchema('gam'), value: Schema.Int },
});
const Sending = makeState({
  stateName: 'sending',
  input: { aggregateId: Schema.String, gameId: makeAbbreviationIdSchema('gam'), value: Schema.Int },
});
const readNext = (db: { query: { machineGame: { findMany: () => { sync: () => unknown } } } }, aggregateId: string) => {
  const rows = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({
    id: makeAbbreviationIdSchema('gam'),
    turn: Schema.String,
    value: Schema.Int,
  })))(db.query.machineGame.findMany().sync());
  const row = rows.find(candidate => candidate.turn === 'O');
  return row === undefined ? undefined : Deciding.make({ aggregateId, gameId: row.id, value: row.value });
};
export const computerTurn = makeMachine({
  source: machineGame,
  selections: captureActorSelections(db, {
    machineGame: db.query.machineGame.findMany(),
  }, Schema.Struct({})),
  contracts: { machinePlayO: { contract: playO, target: machineGame } },
  states: { idle: Idle, deciding: Deciding, sending: Sending },
  onBootstrap: () => Idle.make({}),
  routes: {
    idle: { onCommand: ({ db, command }) => 'aggregateId' in command ? readNext(db, command.aggregateId) : undefined },
    deciding: {
      onCommand: ({ db, origin }) => {
        const next = readNext(db, origin.aggregateId);
        return next === undefined
          ? Idle.make({})
          : next.gameId === origin.gameId && next.value === origin.value
            ? undefined
            : next;
      },
      onActivation: ({ origin }) => Effect.gen(function* () {
        const decide = yield* MachineDecision;
        const value = yield* decide(origin.value);
        return value === null
          ? Idle.make({})
          : Sending.make({ aggregateId: origin.aggregateId, gameId: origin.gameId, value });
      }),
    },
    sending: {
      command: ({ origin }) => execute({
        binding: 'machinePlayO',
        aggregateId: origin.aggregateId,
        payload: { id: origin.gameId, value: origin.value },
      }),
      onResult: () => Idle.make({}),
    },
  },
});
