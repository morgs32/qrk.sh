import { describe, expect, it } from 'vitest';

import { isValidMove } from './isValidMove';

describe('authoritative move rule', () => {
  const game = {
    board: '.........',
    turn: 'X' as const,
    outcome: 'playing' as const,
  };

  it('accepts the current turn and an empty square', () => {
    expect(isValidMove(game, { board: game.board, square: 4 }, 'X')).toBe(true);
  });

  it('rejects a stale board, stale turn, occupied square, and ended game', () => {
    expect(isValidMove(game, { board: 'X........', square: 4 }, 'X')).toBe(
      false,
    );
    expect(isValidMove(game, { board: game.board, square: 4 }, 'O')).toBe(
      false,
    );
    expect(
      isValidMove(
        { ...game, board: 'X........' },
        { board: 'X........', square: 0 },
        'X',
      ),
    ).toBe(false);
    expect(
      isValidMove(
        { ...game, outcome: 'X' },
        { board: game.board, square: 4 },
        'X',
      ),
    ).toBe(false);
  });
});
