import { Effect } from 'effect';

/**
 * Keep commands decoded in domain; encode only at persistence and wire boundaries.
 *
 * @bad Domain alias `IAcceptedEntry = IEncodedCommand<IExecutedAccountCommand> & { mutations: ... }`.
 * @bad `JSON.parse` command payload inside AccountRepo finalize paths.
 */
export type IFinalizationEventFanoutPayload = Readonly<{
  executedCommands: readonly IExecutedAccountCommand[];
  appliedMutations: readonly IEncodedAppliedMutation[];
}>;

export const finalizeAccountCommand = Effect.fn('finalizeAccountCommand')(
  function* (props: {
    contract: {
      validatePayload: (p: unknown) => Effect.Effect<unknown, unknown, unknown>;
      program: (p: unknown) => Effect.Effect<unknown, unknown, unknown>;
    };
    command: IExecutedAccountCommand;
    tx: unknown;
  }) {
    const decodedPayload = yield* props.contract.validatePayload({
      payload: props.command.payload,
    });
    const mutations = yield* props.contract.program({
      payload: decodedPayload,
    });

    for (const [mutationIndex, mutation] of Object.values(
      mutations,
    ).entries()) {
      const appliedMutation = yield* applyMutationTx({
        tx: props.tx,
        mutation,
        commandId: props.command.id,
        mutationIndex,
        appliedAt: props.command.executedAt,
      });
      yield* encodeAppliedMutation({ mutation: appliedMutation });
    }
  },
);

declare type IExecutedAccountCommand = {
  id: string;
  payload: unknown;
  executedAt: number;
};
declare type IEncodedAppliedMutation = unknown;
declare function applyMutationTx(
  props: unknown,
): Effect.Effect<unknown, unknown, unknown>;
declare function encodeAppliedMutation(props: {
  mutation: unknown;
}): Effect.Effect<unknown, unknown, unknown>;
