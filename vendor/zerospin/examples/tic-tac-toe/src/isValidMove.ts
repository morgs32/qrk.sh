/** Shared rule used by browser admission and authoritative aggregate guards. */
export const isValidMove = (
  current:
    | Readonly<{
        board: string;
        turn: 'X' | 'O';
        outcome: 'playing' | 'X' | 'O' | 'draw';
      }>
    | undefined,
  payload: Readonly<{ board: string; square: number }>,
  mark: 'X' | 'O',
) =>
  current !== undefined &&
  current.board === payload.board &&
  current.turn === mark &&
  current.outcome === 'playing' &&
  Number.isInteger(payload.square) &&
  payload.square >= 0 &&
  payload.square <= 8 &&
  payload.board[payload.square] === '.';
