import type { IAggregateActorOutput } from '@zerospin/core/aggregateSession/types';
import type { ITx } from '@zerospin/core/drizzle/types';
import type { ISelection } from '@zerospin/core/models/makeSelection';
import type {
  IAnyModels,
  IEncodedResourceShape,
  IModel,
} from '@zerospin/core/models/types';
import { mapParseError } from '@zerospin/error';
import { Effect } from 'effect';

import { aggregateActorVersionRepoDbConfig } from '../aggregateActorVersionRepoDbConfig.js';
import { readSelectedResources } from '../readSelectedResources.js';

/** Select the identity graph, emit one actor command, and checkpoint the projection. */
export const commitActorProjectionTx = Effect.fn('commitActorProjectionTx')(
  function* (props: {
    tx: ITx;
    models: IAnyModels;
    selections: Record<string, ISelection<IModel>>;
    identity: Readonly<Record<string, string>>;
    aggregateVersion: string;
    graph: readonly IEncodedResourceShape[];
    executedIndex: number;
    executedHash: string;
    aggregateIndex: number;
    output: Omit<IAggregateActorOutput, 'command'> & {
      command: Omit<IAggregateActorOutput['command'], 'delta'>;
    };
    ownerClaims: Readonly<Record<string, unknown>> | null;
    ownerSessionName: string | null;
    nodeId: string | null;
    nodeIndex: number | null;
  }) {
    const {
      tx,
      models,
      selections,
      identity,
      aggregateVersion,
      graph,
      executedIndex,
      executedHash,
      aggregateIndex,
    } = props;
    const nextGraph = yield* readSelectedResources({
      db: tx,
      models,
      selections,
      identity,
    });

    const before = new Map(
      graph.map(resource => [
        `${resource.modelName}\u0000${resource.id}`,
        resource,
      ]),
    );
    const after = new Map(
      nextGraph.map(resource => [
        `${resource.modelName}\u0000${resource.id}`,
        resource,
      ]),
    );
    const actorDelta = {
      upserted: nextGraph.filter(resource => {
        const previous = before.get(
          `${resource.modelName}\u0000${resource.id}`,
        );
        return (
          previous === undefined ||
          JSON.stringify(previous) !== JSON.stringify(resource)
        );
      }),
      deleted: graph
        .filter(
          resource => !after.has(`${resource.modelName}\u0000${resource.id}`),
        )
        .map(resource => ({
          modelName: resource.modelName,
          id: resource.id,
        })),
    };

    const retained =
      yield* aggregateActorVersionRepoDbConfig.tables.browserCommandOutbox
        .encodeRow({
          executedIndex,
          executedHash,
          aggregateIndex,
          ...props.output.command,
          delta: actorDelta,
          completionNodeId: props.nodeId,
          completionNodeIndex: props.nodeIndex,
          completionClaims: props.ownerClaims,
          completionSessionName: props.ownerSessionName,
          lastDeliveryFailure: null,
        })
        .pipe(
          mapParseError({
            code: 'projection-output-invalid',
            prefix: 'Failed to encode actor output',
          }),
        );
    tx.insert(aggregateActorVersionRepoDbConfig.schema.browserCommandOutbox)
      .values(retained)
      .run();
    tx.insert(aggregateActorVersionRepoDbConfig.schema.actorState)
      .values({
        id: 1,
        aggregateIndex,
        executedIndex,
        executedHash,
        aggregateVersion,
      })
      .onConflictDoUpdate({
        target: aggregateActorVersionRepoDbConfig.schema.actorState.id,
        set: {
          aggregateIndex,
          executedIndex,
          executedHash,
          aggregateVersion,
        },
      })
      .run();

    return {
      executedIndex,
      executedHash,
      graph: nextGraph,
      changed: actorDelta.upserted.length > 0 || actorDelta.deleted.length > 0,
    };
  },
);
