/*
 * System-worker annotation:
 * Applies account mutations that still matter to a frontend graph and returns
 * the committed resource rows for frontend sync.
 */

import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import type { IEncodedAppliedMutation } from '@zerospin/core/contracts/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import type {
  IEncodedResourceShape,
  IModels,
} from '@zerospin/core/models/types';
import type { IRefRecord } from '@zerospin/core/system/types';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export const getUpdatedResources = Effect.fn('getUpdatedResources')(
  function* (props: {
    appliedMutations: readonly IEncodedAppliedMutation[];
    frontendModels: IModels;
    graph: IRefRecord;
    tx: ITx;
  }): Effect.fn.Return<readonly IEncodedResourceShape[], IAnyError> {
    const { appliedMutations, frontendModels, graph, tx } = props;
    const updated: IEncodedResourceShape[] = [];

    for (const mutation of appliedMutations) {
      // 1. Skip account mutations for models this frontend does not project.
      if (frontendModels[mutation.modelName] === undefined) {
        continue;
      }

      // 2. Skip resources outside the post-membership graph.
      if (graph[mutation.resourceId] === undefined) {
        continue;
      }

      const updatedResource = yield* commitAppliedMutationTx({
        tx,
        models: frontendModels,
        mutation,
      });

      // 3. Return the committed row only when the resource still remains selected.
      if (updatedResource !== null && graph[updatedResource.id] !== undefined) {
        updated.push(updatedResource);
      }
    }

    return updated;
  },
);
