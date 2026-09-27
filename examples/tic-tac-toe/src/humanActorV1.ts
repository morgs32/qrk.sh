import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';

import { computerTurn } from './computerTurn';
import { createGame } from './contracts/createGameV1';
import { playX } from './contracts/playXV1';
import { game, identitySchema } from './gameV1';

const db = makeActorDbVersion({ models: { game } });
const path = RoutePattern.parse('/:aggregateId/:instanceId');
const identity = makeActorIdentity({ schema: identitySchema, actorPath: path });
export const human = makeAggregateActorVersion(
  { name: 'human' },
  {
    authentication: 'none',
    version: '1.0.0',
    db,
    identity,
    queries: {
      game: db.query.game.findMany({
        where: { id: { eq: identity.sql.placeholder('instanceId') } },
      }),
    },
    contracts: { createGame, playX },
    automations: { computerTurn },
  },
);
