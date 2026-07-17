/**
 * Filter fanout command outcomes by ownership, but preserve the whole encoded command object.
 *
 * @bad Rebuild terminal commands field-by-field before publishing or syncing.
 * @bad Null provenance fields such as `sessionId`, `actorId`, `actorName`, `frontendName`, or `pushedCursor`.
 * @bad Use session lifecycle row shapes as fanout, sync, or websocket payload shapes.
 * @bad Spread websocket events only to overwrite command arrays with identical command arrays.
 */
export function projectFrontendCommandOutcomes(props: {
  events: readonly ActorDeltaEvent[];
  pushedCommandIds: ReadonlySet<string>;
}) {
  const executedPushedCommands: EncodedFinalizedAccountCommand[] = [];
  const failedPushedCommands: EncodedFailedAccountCommand[] = [];

  for (const event of props.events) {
    for (const command of event.payload.executedCommands) {
      if (!props.pushedCommandIds.has(command.id)) {
        continue;
      }

      executedPushedCommands.push(command);
    }

    for (const command of event.payload.failedCommands) {
      if (!props.pushedCommandIds.has(command.id)) {
        continue;
      }

      failedPushedCommands.push(command);
    }
  }

  return {
    executedPushedCommands,
    failedPushedCommands,
  };
}

export const frontendDeltaPayloadShape = {
  executedPushedCommands: jsonColumn({
    schema: arraySchema(EncodedExecutedAccountCommandSchema),
  }),
  failedPushedCommands: jsonColumn({
    schema: arraySchema(EncodedFailedAccountCommandSchema),
  }),
};

export function broadcastFrontendFanout(events: readonly FrontendDeltaEvent[]) {
  return JSON.stringify({
    type: 'fanout',
    events,
  });
}

declare type EncodedFinalizedAccountCommand = {
  id: string;
  sessionId: string | null;
  actorId: string | null;
  actorName: string | null;
  frontendName: string | null;
  pushedCursor: string | null;
  status: 'executed';
};

declare type EncodedFailedAccountCommand = {
  id: string;
  sessionId: string | null;
  actorId: string | null;
  actorName: string | null;
  frontendName: string | null;
  pushedCursor: string | null;
  status: 'failed';
};

declare type ActorDeltaEvent = {
  payload: {
    executedCommands: readonly EncodedFinalizedAccountCommand[];
    failedCommands: readonly EncodedFailedAccountCommand[];
  };
};

declare type FrontendDeltaEvent = {
  payload: {
    executedPushedCommands: readonly EncodedFinalizedAccountCommand[];
    failedPushedCommands: readonly EncodedFailedAccountCommand[];
  };
};

declare const EncodedExecutedAccountCommandSchema: unknown;
declare const EncodedFailedAccountCommandSchema: unknown;
declare function jsonColumn(props: { schema: unknown }): unknown;
declare function arraySchema(schema: unknown): unknown;
