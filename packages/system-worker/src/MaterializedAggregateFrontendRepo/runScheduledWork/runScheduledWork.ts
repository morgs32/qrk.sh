import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { AggregateFrontendFinalizedCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import { AggregateFrontendFinalizedCommandChain } from '../../AggregateFrontendFinalizedCommandChain/AggregateFrontendFinalizedCommandChain.js';
import type { makeDeliveryQueue } from '../../makeDeliveryQueue/makeDeliveryQueue.js';
import { materializedAggregateFrontendRepoDrizzleSchemas } from '../MaterializedAggregateFrontendRepoDbConfig.js';

export const runScheduledWork = Effect.fn(
  'MaterializedAggregateFrontendRepo.runScheduledWork',
)(function* (props: {
  db: IDb;
  deliveryQueue: ReturnType<typeof makeDeliveryQueue>;
  finalizedCommandChains: Cloudflare.Env['AGGREGATE_FRONTEND_FINALIZED_COMMAND_CHAIN'];
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    userId: string;
    frontendName: string;
  };
  storage: DurableObjectStorage;
}) {
  const chainName =
    yield* AggregateFrontendFinalizedCommandChain.fixedDORepoConfig.nameUtils.makeName(
      props.key,
    );
  const finalizedCommands = {
    name: 'MaterializedAggregateFrontendRepo.finalizedCommands',
    requested: true,
    drain: Effect.fn(
      'MaterializedAggregateFrontendRepo.finalizedCommands.drain',
    )(function* () {
      const rows = props.db
        .select()
        .from(
          materializedAggregateFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
        )
        .where(
          isNull(
            materializedAggregateFrontendRepoDrizzleSchemas
              .finalizedCommandOutbox.publishedAt,
          ),
        )
        .orderBy(
          asc(
            materializedAggregateFrontendRepoDrizzleSchemas
              .finalizedCommandOutbox.frontendIndex,
          ),
        )
        .all();
      for (const row of rows) {
        const command = yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(AggregateFrontendFinalizedCommandSchema),
        )(row.command).pipe(
          mapParseError({
            code: 'materialized-aggregate-frontend-outbox-command-invalid',
            prefix: `Failed to decode finalized command ${row.frontendIndex}`,
          }),
        );
        const published = yield* props.deliveryQueue
          .retry(
            makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
              () =>
                props.finalizedCommandChains
                  .getByName(chainName)
                  .publishCommand({ command }),
              ZerospinError.catch({
                code: 'materialized-aggregate-frontend-publish-rpc-failed',
                message: `Failed to publish frontendIndex ${row.frontendIndex}`,
              }),
            ).pipe(Effect.flatMap(decodeRpc)),
          )
          .pipe(Effect.result);
        props.db
          .update(
            materializedAggregateFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
          )
          .set(
            Result.isSuccess(published)
              ? { publishedAt: new Date(), failure: null }
              : { failure: ZerospinError.stringify(published.failure) },
          )
          .where(
            eq(
              materializedAggregateFrontendRepoDrizzleSchemas
                .finalizedCommandOutbox.frontendIndex,
              row.frontendIndex,
            ),
          )
          .run();
        if (Result.isFailure(published)) return yield* published.failure;
      }
    }),
    hasPending: () =>
      Effect.sync(
        () =>
          props.db
            .select({
              frontendIndex:
                materializedAggregateFrontendRepoDrizzleSchemas
                  .finalizedCommandOutbox.frontendIndex,
            })
            .from(
              materializedAggregateFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
            )
            .where(
              isNull(
                materializedAggregateFrontendRepoDrizzleSchemas
                  .finalizedCommandOutbox.publishedAt,
              ),
            )
            .limit(1)
            .get() !== undefined,
      ),
  };
  const drained = yield* props.deliveryQueue
    .drain({ lanes: [finalizedCommands] })
    .pipe(
      Effect.tapError(() =>
        Effect.promise(() => props.storage.setAlarm(Date.now() + 1_000)),
      ),
    );
  yield* Effect.promise(() =>
    drained.pending
      ? props.storage.setAlarm(Date.now() + 1_000)
      : props.storage.deleteAlarm(),
  );
  return drained;
});
