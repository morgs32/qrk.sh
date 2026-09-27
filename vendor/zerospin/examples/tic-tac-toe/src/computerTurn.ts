import { makeAutomation } from '@zerospin/core/automation/makeAutomation';
import { Context, Effect, Layer } from 'effect';

import { playO } from './contracts/playOV1';
import { playX } from './contracts/playXV1';

/** Replace this service with an LLM-backed Effect without changing the automation. */
export class ChooseComputerMove extends Context.Service<
  ChooseComputerMove,
  (board: string) => Effect.Effect<number>
>()('ChooseComputerMove') {}

export const deterministicComputerMove = Layer.succeed(
  ChooseComputerMove,
  board => Effect.succeed(board.indexOf('.')),
);

export const computerTurn = makeAutomation({
  name: 'computerTurn',
  on: playX,
  contracts: { playO },
  program: Effect.fn('computerTurn')(function* ({ db, on, contracts }) {
    const game = db.query.game
      .findFirst({ where: { id: { eq: on.payload.id } } })
      .sync();
    if (game === undefined || game.outcome !== 'playing' || game.turn !== 'O') {
      return null;
    }
    const chooseMove = yield* ChooseComputerMove;
    const square = yield* chooseMove(game.board);
    return contracts.playO({ id: game.id, board: game.board, square });
  }),
});
