import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IEncodedCommand } from '@zerospin/core/contracts/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import type { IServiceFrontendFinalizedCommand } from '@zerospin/core/serviceSession/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { defaultRetrySchedule } from '@zerospin/core/utils/defaultRetrySchedule';
import {
  mapParseError,
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { asc, eq, isNull } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';

import { materializedServiceFrontendRepoDrizzleSchemas } from '../MaterializedServiceFrontendRepoDbConfig.js';

export const publishFinalizedCommands = Effect.fn(
  'MaterializedServiceFrontendRepo.publishFinalizedCommands',
)(function* (props: {
  db: IDb;
  finalizedCommandChain: Readonly<{
    publishCommand(props: {
      command: IEncodedCommand<IServiceFrontendFinalizedCommand>;
    }): PromiseLike<IEncodedResult<void, IAnyErrorJson>>;
  }>;
}) {
  const rows = props.db
    .select()
    .from(materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox)
    .where(
      isNull(
        materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox
          .publishedAt,
      ),
    )
    .orderBy(
      asc(
        materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox
          .serviceFrontendIndex,
      ),
    )
    .limit(64)
    .all();
  for (const row of rows) {
    const command = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceFrontendFinalizedCommandSchema),
    )(row.command).pipe(
      mapParseError({
        code: 'materialized-service-frontend-outbox-command-invalid',
        prefix: `Failed to decode outbox command ${row.serviceFrontendIndex}`,
      }),
    );
    const published = yield* makeAsync<
      IEncodedResult<void, IAnyErrorJson>,
      IAnyError
    >(
      () => props.finalizedCommandChain.publishCommand({ command }),
      ZerospinError.catch({
        code: 'materialized-service-frontend-publish-rpc-failed',
        message: `Failed to publish serviceFrontendIndex ${row.serviceFrontendIndex}`,
      }),
    )
      .pipe(Effect.flatMap(decodeRpc))
      .pipe(Effect.retry({ schedule: defaultRetrySchedule }), Effect.result);
    props.db
      .update(
        materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox,
      )
      .set(
        Result.isSuccess(published)
          ? { publishedAt: new Date(), failure: null }
          : { failure: ZerospinError.stringify(published.failure) },
      )
      .where(
        eq(
          materializedServiceFrontendRepoDrizzleSchemas.finalizedCommandOutbox
            .serviceFrontendIndex,
          row.serviceFrontendIndex,
        ),
      )
      .run();
    if (Result.isFailure(published)) {
      return yield* published.failure;
    }
  }
});
