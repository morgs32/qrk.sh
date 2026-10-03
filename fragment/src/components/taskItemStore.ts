import { create } from 'zustand';

import { taskItemScript } from './taskItemScript';

type Phase =
  | 'idle'
  | 'background'
  | 'editing'
  | 'holding'
  | 'checked'
  | 'collapsing'
  | 'expanding';

type TaskItemState = {
  rows: [string, string, string];
  stepIndex: number;
  phase: Phase;
  advance: () => (typeof taskItemScript)[number] | undefined;
  finishCollapse: () => void;
  finishExpand: () => void;
  reset: () => void;
};

const initialState = () => ({
  rows: ['', '', ''] as TaskItemState['rows'],
  stepIndex: 0,
});

export const useTaskItemStore = create<TaskItemState>((set, get) => ({
  ...initialState(),
  phase: 'idle',
  advance: () => {
    const { rows, stepIndex, phase } = get();

    if (phase === 'idle' || phase === 'holding' || phase === 'background') {
      const nextIndex = phase === 'idle' ? 0 : stepIndex + 1;
      const step = taskItemScript[nextIndex];
      if (!step) {
        set({ phase: 'checked' });
        return;
      }
      set({
        stepIndex: nextIndex,
        phase: step.kind === 'edit' ? 'editing' : 'background',
      });
      return step;
    }

    if (phase === 'checked') {
      set({ phase: 'collapsing' });
      return;
    }

    if (phase !== 'editing') return;

    const step = taskItemScript[stepIndex];
    if (step.kind !== 'edit') return;
    const { row, text } = step;
    const current = rows[row];
    let prefixLength = 0;
    while (
      prefixLength < current.length &&
      current[prefixLength] === text[prefixLength]
    ) {
      prefixLength++;
    }

    if (current === text) {
      set({ phase: 'holding' });
      return;
    }

    const next =
      current.length > prefixLength
        ? current.slice(0, -1)
        : text.slice(0, current.length + 1);
    const nextRows = [...rows] as TaskItemState['rows'];
    nextRows[row] = next;
    set({ rows: nextRows, phase: next === text ? 'holding' : 'editing' });
  },
  finishCollapse: () => {
    if (get().phase !== 'collapsing') return;
    set({ ...initialState(), phase: 'expanding' });
  },
  finishExpand: () => {
    if (get().phase !== 'expanding') return;
    set({ phase: 'idle' });
  },
  reset: () => {
    set({ ...initialState(), phase: 'idle' });
  },
}));
