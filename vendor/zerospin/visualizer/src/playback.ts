import type { IRows, IScenario, ISnapshot } from './types';

const copyRows = (rows: IRows): IRows => structuredClone(rows);

/** Rebuild from the initial fixture so reversing and scrubbing never depend on prior playback. */
export function snapshotAt(
  scenario: IScenario,
  requestedIndex: number,
): ISnapshot {
  const stepIndex = Number.isFinite(requestedIndex)
    ? Math.min(
        scenario.steps.length - 1,
        Math.max(-1, Math.trunc(requestedIndex)),
      )
    : -1;
  const rows = copyRows(scenario.initialRows);
  let previousRows = copyRows(rows);
  for (let index = 0; index <= stepIndex; index += 1) {
    const currentStep = scenario.steps[index];
    if (currentStep === undefined) break;
    if (index === stepIndex) previousRows = copyRows(rows);
    for (const change of currentStep.changes) {
      rows[change.tableId] = structuredClone(change.rows);
    }
  }
  const step = scenario.steps[stepIndex];
  return {
    rows,
    previousRows,
    step,
    stepIndex,
    changedTableIds: [
      ...new Set(step?.changes.map(change => change.tableId) ?? []),
    ],
  };
}
