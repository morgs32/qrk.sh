import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import { computerTurn } from './computerTurn';
import { createGame } from './contracts/createGameV1';
import { playO } from './contracts/playOV1';
import { playX } from './contracts/playXV1';
import { game } from './gameV1';
import { human } from './humanActorV1';
import { isValidMove } from './isValidMove';

export const aggregate = makeAggregateVersion(
  defineAggregate({ name: 'game' }),
  {
    version: '1.0.0',
    models: { game },
    contracts: { createGame, playX, playO },
    automations: { computerTurn },
    actors: { human },
    guards: {
      human: {
        playX: Effect.fn('game.authoritativePlayX')(function* ({
          queryDb,
          payload,
          claims,
        }) {
          const current = queryDb.query.game
            .findFirst({ where: { id: { eq: payload.id } } })
            .sync();
          if (
            claims.instanceId !== payload.id ||
            !isValidMove(current, payload, 'X')
          ) {
            return yield* makeZerospinError('invalid-move');
          }
        }),
        playO: Effect.fn('game.authoritativePlayO')(function* ({
          queryDb,
          payload,
        }) {
          const current = queryDb.query.game
            .findFirst({ where: { id: { eq: payload.id } } })
            .sync();
          if (!isValidMove(current, payload, 'O')) {
            return yield* makeZerospinError('invalid-move');
          }
        }),
      },
    },
  },
);
