/**
 * Name deltas for the owner and phase of the command occurrence.
 * Use stagedDelta for tab-local execution and optimistic replay,
 * executionDelta for authoritative execution, and actorDelta for selected resources.
 * Filtering selected resources keeps the actorDelta field name.
 * Failed staging retains no command. Admission rejection skips execution.
 * Each failed phase owns one PublicFailureSchema value, with no nested JSON string.
 * Local-only sessions skip admission/execution; timestamps exist only for attempted phases.
 *
 * @bad Call an actor command field delta or deliveredDelta.
 * @bad Rename actorDelta during delivery to a tab or node.
 */
export type ICommandDeltas = {
  staging: { startedAt: Date; completedAt: Date; stagedDelta: unknown };
  execution: {
    status: 'succeeded';
    startedAt: Date;
    completedAt: Date;
    executionDelta: unknown;
  };
  actorDelta: { upserted: readonly unknown[]; deleted: readonly unknown[] };
};
