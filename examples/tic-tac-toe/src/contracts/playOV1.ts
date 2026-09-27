import * as sdk from '@zerospin/sdk/browser';
import { Effect } from 'effect';

import { claimsSchema, game, outcome } from '../gameV1';
import { isValidMove } from '../isValidMove';

export const playO = sdk.makeContractVersion(sdk.defineContract('playO'), {
  version: '1.0.0',
  models: { game },
  claims: claimsSchema,
  failures: {
    invalidMove: sdk.ContractError.schema({ code: 'invalid-move' }),
  },
  payload: {
    id: sdk.primitives.foreignKey({ abbreviation: 'gam' }),
    board: sdk.primitives.text(),
    square: sdk.primitives.integer(),
  },
  guard: Effect.fn('playO.guard')(function* ({
    failures,
    payload,
    claims,
    queryDb,
  }) {
    const current = queryDb.query.game
      .findFirst({ where: { id: { eq: payload.id } } })
      .sync();
    if (
      claims === null ||
      claims.instanceId !== payload.id ||
      !isValidMove(current, payload, 'O')
    ) {
      return yield* failures.invalidMove.make({ extra: null });
    }
  }),
  program: ({ payload, models }) => {
    const board =
      payload.board.slice(0, payload.square) +
      'O' +
      payload.board.slice(payload.square + 1);
    return models.game
      .update({
        resourceId: payload.id,
        attributes: {
          board,
          turn: 'X',
          outcome: outcome(board),
        },
      })
      .pipe(Effect.map(mutation => [mutation]));
  },
});
