import { create } from 'zustand';

type Mark = 'X' | 'O' | null;
type Phase = 'idle' | 'moving' | 'x-turn' | 'thinking' | 'complete';

const scriptedMoves = [0, 4, 8, 2, 6, 3, 5, 7];
const emptyBoard = (): Mark[] => Array.from({ length: 9 }, () => null);

interface GameState {
  board: Mark[];
  phase: Phase;
  moveIndex: number;
  cursorIndex: number | null;
  reset: () => void;
  moveCursor: () => void;
  playNext: () => void;
  respond: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  board: emptyBoard(),
  phase: 'idle',
  moveIndex: 0,
  cursorIndex: null,
  reset: () => set({ board: emptyBoard(), phase: 'idle', moveIndex: 0, cursorIndex: null }),
  moveCursor: () => {
    const { moveIndex, phase } = get();
    const index = scriptedMoves[moveIndex];
    if ((phase !== 'idle' && phase !== 'x-turn') || index === undefined) return;
    set({ cursorIndex: index, phase: 'moving' });
  },
  playNext: () => {
    const { board, moveIndex, phase } = get();
    const index = scriptedMoves[moveIndex];
    if (phase !== 'moving' || index === undefined) return;

    const nextBoard = [...board];
    nextBoard[index] = 'X';
    set({ board: nextBoard, phase: 'thinking', moveIndex: moveIndex + 1 });
  },
  respond: () => {
    const { board, moveIndex, phase } = get();
    const index = scriptedMoves[moveIndex];
    if (phase !== 'thinking' || index === undefined) return;

    const nextBoard = [...board];
    nextBoard[index] = 'O';
    const nextMoveIndex = moveIndex + 1;
    set({
      board: nextBoard,
      phase: nextMoveIndex === scriptedMoves.length ? 'complete' : 'x-turn',
      moveIndex: nextMoveIndex,
    });
  },
}));
