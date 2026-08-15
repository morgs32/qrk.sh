import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import type {
  IContract,
  IEncodedAppliedMutation,
  IEncodedCommand,
  IExecutedAggregateCommand,
} from '@zerospin/core/contracts/types';
import { Effect } from 'effect';

/**
 * Keep commands decoded in domain work; persist the complete encoded command at the block boundary.
 *
 * @bad Create a domain alias by intersecting `IEncodedCommand<IExecutedAggregateCommand>` with mutation state.
 * @bad `JSON.parse` command payload inside AggregateRepo finalization.
 * @bad Rebuild the terminal command from a hand-picked field subset.
 */
export const persistAggregateCommandOutcome = Effect.fn(
  'persistAggregateCommandOutcome',
)(function* (props: {
  appliedMutations: readonly IEncodedAppliedMutation[];
  command: IExecutedAggregateCommand;
  contract: IContract;
  insertBlock(props: {
    executedCommands: readonly IEncodedCommand<IExecutedAggregateCommand>[];
    appliedMutations: readonly IEncodedAppliedMutation[];
  }): void;
}) {
  const encodedCommand = yield* encodeCommand({
    command: props.command,
    contract: props.contract,
  });

  props.insertBlock({
    executedCommands: [encodedCommand],
    appliedMutations: props.appliedMutations,
  });
});
