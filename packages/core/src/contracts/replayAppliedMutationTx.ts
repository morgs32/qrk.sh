/*
 * replayAppliedMutationTx owns replay phase 5: apply one prepared mutation at
 * its stored timestamp, then encode inverse state from the current model.
 */

import type { IAnyError } from '@zerospin/error';
import { Effect, type Schema } from 'effect';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import type { IModels } from '../models/types.ts';

import { applyAggregateMutationTx } from './applyAggregateMutationTx.ts';
import { encodeAppliedMutation } from './encodeAppliedMutation.ts';
import { prepareReplayAppliedMutation } from './prepareReplayAppliedMutation.ts';
import type {
  IAnyMutation,
  IEncodedAppliedMutation,
  IOperationName,
} from './types.ts';

export const replayAppliedMutationTx = Effect.fn('replayAppliedMutationTx')(
  function* <CONFIG extends IDbConfig>(props: {
    tx: ITx<CONFIG>;
    mutation: IEncodedAppliedMutation;
    controller: {
      models: IModels;
      mutationAdapters:
        | Record<
            string,
            Partial<
              Record<
                IOperationName,
                readonly {
                  source: Schema.Codec<IAnyMutation, unknown>;
                  destination: Schema.Codec<IAnyMutation, unknown> | null;
                  adapter?: unknown;
                }[]
              >
            >
          >
        | undefined;
    };
  }): Effect.fn.Return<IEncodedAppliedMutation | null, IAnyError> {
    const { tx, mutation, controller } = props;
    const targetMutation = yield* prepareReplayAppliedMutation({
      mutation,
      controller,
    });
    if (targetMutation === null) {
      return null;
    }

    const appliedMutation = yield* applyAggregateMutationTx({
      tx,
      mutation: targetMutation,
      commandId: mutation.commandId,
      mutationIndex: mutation.mutationIndex,
      appliedAt: mutation.appliedAt,
    });
    return yield* encodeAppliedMutation({ mutation: appliedMutation });
  },
);
