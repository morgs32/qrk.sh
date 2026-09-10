/*
 * replayAppliedMutationTx owns the replay apply phase: apply one prepared mutation at
 * its stored timestamp, then encode inverse state from the current model.
 */

import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IDbConfig, ITx } from '../drizzle/types.ts';
import type { IAnyModels } from '../models/types.ts';

import { applyAggregateMutationTx } from './applyAggregateMutationTx.ts';
import { encodeAppliedMutation } from './encodeAppliedMutation.ts';
import { prepareReplayAppliedMutation } from './prepareReplayAppliedMutation.ts';
import type { IEncodedAppliedMutation } from './types.ts';

export const replayAppliedMutationTx = Effect.fn('replayAppliedMutationTx')(
  function* <CONFIG extends IDbConfig>(props: {
    tx: ITx<CONFIG>;
    mutation: IEncodedAppliedMutation;
    controller: {
      models: IAnyModels;
    };
  }): Effect.fn.Return<IEncodedAppliedMutation, IAnyError> {
    const { tx, mutation, controller } = props;
    const targetMutation = yield* prepareReplayAppliedMutation({
      mutation,
      controller,
    });

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
