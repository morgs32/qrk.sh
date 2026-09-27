import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { game, identitySchema } from '../gameV1';

export const createGame = sdk.makeContractVersion(
  sdk.defineContract('createGame'),
  {
    version: '1.0.0',
    models: { game },
    identity: identitySchema,
    failures: {
      invalidMove: sdk.ContractError.schema({ code: 'invalid-move' }),
    },
    payload: { id: sdk.primitives.foreignKey({ abbreviation: 'gam' }) },
    guard: Effect.fn('createGame.guard')(function* ({
      failures,
      payload,
      identity,
      queryDb,
    }) {
      if (
        identity === null ||
        payload.id !== identity.instanceId ||
        queryDb.query.game.findFirst().sync() !== undefined
      ) {
        return yield* failures.invalidMove.make({ extra: null });
      }
    }),
    program: ({ payload, models }) =>
      models.game
        .create({
          resourceId: payload.id,
          attributes: { board: '.........', turn: 'X', outcome: 'playing' },
        })
        .pipe(Effect.map(mutation => [mutation])),
  },
);
