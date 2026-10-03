import { createStore } from 'zustand/vanilla';

interface Frame {
  text: string;
  changedIndex: number;
}

type Edit = { from: string; to: string } | { from: string } | { to: string };

function makeFrames(from: string, to: string): Frame[] {
  const costs = Array.from({ length: from.length + 1 }, () =>
    Array<number>(to.length + 1).fill(0),
  );
  for (let i = 0; i <= from.length; i++) costs[i][0] = i;
  for (let j = 0; j <= to.length; j++) costs[0][j] = j;

  for (let i = 1; i <= from.length; i++) {
    for (let j = 1; j <= to.length; j++) {
      costs[i][j] = Math.min(
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + (from[i - 1] === to[j - 1] ? 0 : 1),
      );
    }
  }

  const edits: Edit[] = [];
  let i = from.length;
  let j = to.length;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      costs[i][j] === costs[i - 1][j - 1] + (from[i - 1] === to[j - 1] ? 0 : 1)
    ) {
      edits.push({ from: from[i - 1], to: to[j - 1] });
      i--;
      j--;
    } else if (i > 0 && costs[i][j] === costs[i - 1][j] + 1) {
      edits.push({ from: from[i - 1] });
      i--;
    } else {
      edits.push({ to: to[j - 1] });
      j--;
    }
  }

  const frames: Frame[] = [];
  let prefix = '';
  let remainder = from;
  for (const edit of edits.reverse()) {
    if ('from' in edit) remainder = remainder.slice(1);
    if ('to' in edit) prefix += edit.to;
    if (!('from' in edit && 'to' in edit && edit.from === edit.to)) {
      frames.push({
        text: prefix + remainder,
        changedIndex: Math.max(0, prefix.length - 1),
      });
    }
  }
  return frames;
}

interface StringReplaceState {
  text: string;
  changedIndex: number | null;
  frameNumber: number;
  requestId: number;
  frames: Frame[];
  replaceWith: (next: string) => string | undefined;
  reset: () => void;
  advance: (requestId: number) => string | undefined;
}

export function createStringReplaceStore(initialText: string) {
  return createStore<StringReplaceState>((set, get) => ({
    text: initialText,
    changedIndex: null,
    frameNumber: 0,
    requestId: 0,
    frames: [],
    replaceWith: next => {
      const state = get();
      const frames = makeFrames(state.text, next);
      set({ frames, changedIndex: null, requestId: state.requestId + 1 });
      return frames.length === 0 ? next : undefined;
    },
    reset: () =>
      set(state => ({
        text: initialText,
        changedIndex: null,
        frames: [],
        requestId: state.requestId + 1,
      })),
    advance: requestId => {
      const state = get();
      if (state.requestId !== requestId || state.frames.length === 0) return;
      const [frame, ...remaining] = state.frames;
      set({
        text: frame.text,
        changedIndex: frame.changedIndex,
        frameNumber: state.frameNumber + 1,
        frames: remaining,
      });
      return remaining.length === 0 ? frame.text : undefined;
    },
  }));
}
