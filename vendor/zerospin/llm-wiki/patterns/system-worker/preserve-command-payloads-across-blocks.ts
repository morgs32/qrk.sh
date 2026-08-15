import type {
  IEncodedCommand,
  IExecutedAggregateCommand,
  IExecutedPushedCommand,
  IFailedAggregateCommand,
  IFailedPushedCommand,
} from '@zerospin/core/contracts/types';

/**
 * Filter pushed outcomes from AggregateBlocks while preserving each complete encoded command object.
 *
 * @bad Rebuild terminal commands field-by-field before publishing or syncing.
 * @bad Null provenance such as `sessionId`, `aggregateId`, `aggregateName`, `userId`, `frontendName`, or `pushedCursor`.
 * @bad Use storage lifecycle-row shapes as block, sync, or WebSocket command shapes.
 */
export function selectPushedCommandOutcomes(props: {
  blocks: readonly Readonly<{
    executedCommands: readonly (
      | IEncodedCommand<IExecutedAggregateCommand>
      | IEncodedCommand<IExecutedPushedCommand>
    )[];
    failedCommands: readonly (
      | IEncodedCommand<IFailedAggregateCommand>
      | IEncodedCommand<IFailedPushedCommand>
    )[];
  }>[];
  pushedCommandIds: ReadonlySet<string>;
}) {
  const executedPushedCommands: IEncodedCommand<IExecutedPushedCommand>[] = [];
  const failedPushedCommands: IEncodedCommand<IFailedPushedCommand>[] = [];

  for (const block of props.blocks) {
    for (const command of block.executedCommands) {
      if (
        command.commandType === 'frontend' &&
        props.pushedCommandIds.has(command.id)
      ) {
        executedPushedCommands.push(command);
      }
    }

    for (const command of block.failedCommands) {
      if (
        command.commandType === 'frontend' &&
        props.pushedCommandIds.has(command.id)
      ) {
        failedPushedCommands.push(command);
      }
    }
  }

  return { executedPushedCommands, failedPushedCommands };
}
