/**
 * Keep stagedDelta with local staging and actorDelta with retained projection state.
 * Browser IBrowserCommand exposes the session-filtered IActorDelta as delta.
 * Its only other fields are id, commandName, and nullable terminal failure.
 * Position, owner progress, and checkpoint hash belong to the delivery envelope.
 * Server admission/execution results and timestamps remain server-side.
 * Captures survive business rejection; committed outputs do not.
 *
 * @bad Add completion flags, phase summaries, or owner fields to IBrowserCommand.
 * @bad Replace the original command ID with an occurrence ID.
 */
export type ICommandDeltas = {
  staging: { startedAt: Date; completedAt: Date; stagedDelta: unknown };
  execution: {
    status: 'succeeded';
    startedAt: Date;
    completedAt: Date;
  };
  actorDelta: { upserted: readonly unknown[]; deleted: readonly unknown[] };
};
