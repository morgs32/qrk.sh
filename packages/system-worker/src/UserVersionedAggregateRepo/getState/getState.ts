import { makeAsync } from '@zerospin/core/async/makeAsync';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { AggregateFrontendSyncStateSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema, type Semaphore } from 'effect';
import { system } from 'system';

import { UserVersionedAggregateChain } from '../../UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import { catchup } from '../catchup/catchup.js';
import type { execute } from '../execute/execute.js';
import type { UserVersionedAggregateRepo } from '../UserVersionedAggregateRepo.js';
import { userVersionedAggregateRepoDbConfig } from '../userVersionedAggregateRepoDbConfig.js';
/** Snapshot graph and cursor together, then wait for publication without holding the execution semaphore. */
/*
 * Frontend snapshots capture selected state and its cursor, publish through
 * that cursor, then reconcile requested command outcomes from UVAC.
 * Publication waits occur after releasing the local execution permit.
 *
 * 1. Check the requested view identity.
 * 2. Catch the replica up to retained history.
 * 3. Capture state and its cursor together.
 * 4. Decode the captured graph.
 * 5. Publish through the captured cursor and reconcile outstanding commands.
 * 6. Verify durable frontend publication.
 * 7. Return a validated synchronization snapshot.
 */
export const getState = Effect.fn('UserVersionedAggregateRepo.getState')(
  function* (
    props: Parameters<typeof catchup>[0] & {
      db: Parameters<typeof execute>[0]['db'];
      key: Parameters<typeof execute>[0]['key'];
      execution: Semaphore.Semaphore;
      serviceSubscriber: (sourceKey: {
        systemId: string;
        serviceName: string;
        serviceVersion: string;
      }) => Pick<
        ReturnType<
          UserVersionedAggregateRepo['aggregateReplicaFanoutQueueSubscriber']
        >,
        'catchup'
      >;
      requested: {
        aggregateId: string;
        aggregateName: string;
        userId: string;
        frontendName: string;
        outstandingCommandIds: readonly string[];
      };
      deltas: Pick<UserVersionedAggregateRepo['deltas'], 'drain'>;
    },
  ) {
    const { key, requested } = props;

    // 1 — compare aggregateId, aggregateName, and userId with the bound key
    if (
      requested.aggregateId !== key.aggregateId ||
      requested.aggregateName !== key.aggregateName ||
      requested.userId !== key.userId
    ) {
      return yield* new ZerospinError({
        code: 'replica-state-target-mismatch',
        message: 'State request does not match the bound view',
      });
    }

    // 2 — replay through the captured VAC tip
    yield* catchup(props);
    const latest = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregate = yield* getByKeyOrThrow({
      record: latest,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    yield* Effect.forEach(
      Object.entries(aggregate.services),
      ([serviceName, serviceVersion]) =>
        makeAsync(() =>
          props
            .serviceSubscriber({
              systemId: key.systemId,
              serviceName,
              serviceVersion,
            })
            .catchup(),
        ).pipe(Effect.flatMap(decodeRpc)),
    ).pipe(
      // Snapshot catch-up still publishes committed output when a source fails.
      Effect.onExit(() => props.deltas.drain()),
    );

    // 3 — read projectionState under the execution permit
    const captured = yield* props.execution.withPermits(1)(
      Effect.sync(() => ({
        state: props.db
          .select()
          .from(userVersionedAggregateRepoDbConfig.schema.projectionState)
          .where(
            eq(userVersionedAggregateRepoDbConfig.schema.projectionState.id, 1),
          )
          .get(),
      })),
    );

    // 4 — use an empty graph at cursor zero when no projection exists
    const resources =
      captured.state === undefined
        ? []
        : yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Array(EncodedResourceSchema)),
          )(captured.state.graph).pipe(
            mapParseError({
              code: 'replica-state-invalid',
              prefix: 'Invalid retained projected state',
            }),
          );
    const aggregateIndex = captured.state?.aggregateIndex ?? 0;
    const userIndex = captured.state?.userIndex ?? 0;

    // 5 — drain the deltas outbox without retaining the execution permit
    yield* props.deltas.drain(userIndex);
    const chain = yield* UserVersionedAggregateChain.getRepo({ key });
    const published = yield* makeAsync<
      Awaited<ReturnType<UserVersionedAggregateChain['getCommands']>>
    >(() =>
      chain.getCommands({
        afterUserIndex: 0,
        reconcile: {
          commandIds: requested.outstandingCommandIds,
          frontendName: requested.frontendName,
          throughUserIndex: userIndex,
        },
      }),
    ).pipe(Effect.flatMap(decodeRpc));

    // 6 — reject a UVAC tip behind the captured snapshot index
    if (published.tip < userIndex) {
      return yield* new ZerospinError({
        code: 'replica-state-publication-pending',
        message: 'Snapshot cursor has not been durably published',
      });
    }

    // 7 — include bound identity, versions, cursor, complete resolutions, and captured resources
    return yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateFrontendSyncStateSchema),
    )({
      ...key,
      aggregateVersion: key.aggregateVersion,
      aggregateIndex,
      userIndex,
      frontendName: requested.frontendName,
      resolutions: published.commands.flatMap(entry =>
        entry.resolution === null ? [] : [entry.resolution],
      ),
      resources,
    }).pipe(
      mapParseError({
        code: 'replica-state-invalid',
        prefix: 'Invalid frontend snapshot',
      }),
    );
  },
);
