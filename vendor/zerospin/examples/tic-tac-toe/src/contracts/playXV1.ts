import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { game, identitySchema, outcome } from '../gameV1';
import { isValidMove } from '../isValidMove';

export const playX = sdk.makeContractVersion(sdk.defineContract('playX'), {
  version: '1.0.0',
  models: { game },
  identity: identitySchema,
  failures: {
    invalidMove: sdk.ContractError.schema({ code: 'invalid-move' }),
  },
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: 'gam' }),
    board: sdk.primitives.text(),
    square: sdk.primitives.integer(),
  },
  guard: Effect.fn('playX.guard')(function* ({
    failures,
    payload,
    identity,
    queryDb,
  }) {
    const current = queryDb.query.game
      .findFirst({ where: { id: { eq: payload.id } } })
      .sync();
    if (
      identity === null ||
      identity.instanceId !== payload.id ||
      !isValidMove(current, payload, 'X')
    ) {
      return yield* failures.invalidMove.make({ extra: null });
    }
  }),
  program: ({ payload, models }) => {
    const board =
      payload.board.slice(0, payload.square) +
      'X' +
      payload.board.slice(payload.square + 1);
    return models.game
      .update({
        resourceId: payload.id,
        attributes: {
          board,
          turn: 'O',
          outcome: outcome(board),
        },
      })
      .pipe(Effect.map(mutation => [mutation]));
  },
});
