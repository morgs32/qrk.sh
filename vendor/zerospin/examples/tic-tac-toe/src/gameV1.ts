import * as sdk from '@zerospin/sdk/browser';
import { Schema } from 'effect';
export const game = sdk.makeModelVersion(
  sdk.defineModel({ name: 'game', abbreviation: 'gam' }),
  {
    version: '1.0.0',
    attributes: {
      board: sdk.primitives.text(),
      turn: sdk.primitives.enum({ values: ['X', 'O'] }),
      outcome: sdk.primitives.enum({ values: ['playing', 'X', 'O', 'draw'] }),
    },
    indexes: [],
  },
);
export const identitySchema = Schema.Struct({
  aggregateId: Schema.String,
  instanceId: Schema.String,
});

export function outcome(board: string): 'playing' | 'X' | 'O' | 'draw' {
  for (const [a, b, c] of [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ]) {
    const mark = board[a!];
    if (
      (mark === 'X' || mark === 'O') &&
      mark === board[b!] &&
      mark === board[c!]
    ) {
      return mark;
    }
  }
  return board.includes('.') ? 'playing' : 'draw';
}
