import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeAutomation } from '@zerospin/core/automation/makeAutomation';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { ContractError, makeZerospinError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Context, Effect, Schema } from 'effect';

export const game = makeModelVersion(
  defineModel({ name: 'automationGame', abbreviation: 'gam' }),
  {
    version: '1.0.0',
    attributes: { turn: primitives.text(), value: primitives.integer() },
    indexes: [],
  },
);
const identitySchema = Schema.Struct({
  aggregateId: Schema.String,
  instanceId: Schema.String,
});
const identity = makeActorIdentity({
  schema: identitySchema,
  actorPath: RoutePattern.parse('/:aggregateId/:instanceId'),
});
const db = makeActorDbVersion({ models: { automationGame: game } });
const payload = {
  id: primitives.foreignKey({ abbreviation: 'gam' }),
  value: primitives.integer(),
};
export const createGame = makeContractVersion(
  defineContract('automationCreate'),
  {
    version: '1.0.0',
    models: { automationGame: game },
    payload,
    program: ({ models, payload }) =>
      models.automationGame
        .create({
          resourceId: payload.id,
          attributes: { value: payload.value, turn: 'X' },
        })
        .pipe(Effect.map(mutation => [mutation])),
  },
);
export const playX = makeContractVersion(defineContract('automationPlayX'), {
  version: '1.0.0',
  models: { automationGame: game },
  payload,
  program: ({ models, payload }) =>
    models.automationGame
      .update({
        resourceId: payload.id,
        attributes: { value: payload.value, turn: 'O' },
      })
      .pipe(Effect.map(mutation => [mutation])),
});
export const playO = makeContractVersion(defineContract('automationPlayO'), {
  version: '1.0.0',
  models: { automationGame: game },
  payload,
  failures: { stale: ContractError.schema({ code: 'stale' }) },
  guard: Effect.fn(function* ({ queryDb, payload, failures }) {
    const row = queryDb.query.automationGame
      .findFirst({ where: { id: { eq: payload.id } } })
      .sync();
    if (row?.turn !== 'O' || row.value !== payload.value) {
      return yield* failures.stale.make({ extra: null });
    }
  }),
  program: ({ models, payload }) =>
    models.automationGame
      .update({
        resourceId: payload.id,
        attributes: { turn: 'X' },
      })
      .pipe(Effect.map(mutation => [mutation])),
});
export class AutomationDecision extends Context.Service<
  AutomationDecision,
  (value: number) => Effect.Effect<number | null>
>()('tests/AutomationDecision') {}
export const computerTurn = makeAutomation({
  name: 'computerTurn',
  on: playX,
  contracts: { automationPlayO: playO },
  program: Effect.fn(function* ({ db, on, contracts }) {
    const row = db.query.automationGame
      .findFirst({ where: { id: { eq: on.payload.id } } })
      .sync();
    if (row === undefined || row.turn !== 'O') return null;
    const decide = yield* AutomationDecision;
    const value = yield* decide(row.value);
    return value === null
      ? null
      : contracts.automationPlayO({ id: row.id, value });
  }),
});
export const human = makeAggregateActorVersion(
  { name: 'human' },
  {
    authentication: 'none',
    version: '1.0.0',
    db,
    identity,
    queries: {
      automationGame: db.query.automationGame.findMany({
        where: { id: { eq: identity.sql.placeholder('instanceId') } },
      }),
    },
    contracts: { automationCreate: createGame, automationPlayX: playX },
    automations: { computerTurn },
  },
);
const audit = makeAutomation({
  name: 'audit',
  on: playX,
  contracts: {},
  program: ({ on }) =>
    on.payload.value === 3
      ? Effect.fail(makeZerospinError('audit-failed'))
      : Effect.succeed(null),
});
const audited = makeAggregateActorVersion(
  { name: 'audited' },
  {
    authentication: 'none',
    version: '1.0.0',
    db,
    identity,
    queries: human.queries,
    contracts: human.contracts,
    automations: { computerTurn, audit },
  },
);
export const automationGame = makeAggregateVersion(
  { name: 'automationGame' },
  {
    version: '1.0.0',
    models: { automationGame: game },
    contracts: {
      automationCreate: createGame,
      automationPlayX: playX,
      automationPlayO: playO,
    },
    automations: { computerTurn, audit },
    actors: { human, audited },
  },
);
