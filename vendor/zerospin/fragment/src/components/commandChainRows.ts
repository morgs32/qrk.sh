import type { CommandRow } from './CommandChain';
import { taskItemScript } from './taskItemScript';

export function makeCommandRow(
  id: number,
  step: (typeof taskItemScript)[number],
  active = false,
): CommandRow {
  return {
    id,
    cells: [
      String(id).padStart(3, '0'),
      step.taskId,
      step.command,
      step.field,
      step.value,
      'Applied',
    ].map((text, column) => ({
      text,
      blurred: !active || column === 3 || column === 5,
    })),
  };
}

export const initialCommandRows = Array.from({ length: 24 }, (_, index) => {
  const id = 24 - index;
  return makeCommandRow(id, taskItemScript[(id - 1) % taskItemScript.length]);
});
