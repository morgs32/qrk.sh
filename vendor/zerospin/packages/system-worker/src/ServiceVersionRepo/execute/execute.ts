import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { ServiceExecutedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { ServiceVersionChain } from '../../ServiceVersionChain/ServiceVersionChain.js';
import { serviceVersionChainDbConfig } from '../../ServiceVersionChain/serviceVersionChainDbConfig.js';
import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

/** Catch up through the subscriber and recover the requested terminal result. */
export const execute = Effect.fn('ServiceVersionRepo.execute')(
  function* (props: {
    serviceIndex: number;
    db: IDb;
    key: { systemId: string; serviceName: string; serviceVersion: string };
    subscriber: {
      catchup(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    };
  }) {
    const { db, key, serviceIndex, subscriber } = props;
    if (!Number.isSafeInteger(serviceIndex) || serviceIndex < 1) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-execute-index-invalid',
          message: 'Execution requires a positive index',
        }),
      );
    }
    yield* makeAsync(() => subscriber.catchup(serviceIndex)).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
    );
    let rowTable:
      | typeof serviceVersionRepoDbConfig.tables.commands
      | typeof serviceVersionChainDbConfig.tables.commands =
      serviceVersionRepoDbConfig.tables.commands;
    let retained:
      | typeof serviceVersionChainDbConfig.schema.commands.$inferSelect
      | typeof serviceVersionRepoDbConfig.schema.commands.$inferSelect
      | undefined = db
      .select()
      .from(serviceVersionRepoDbConfig.schema.commands)
      .where(
        eq(
          serviceVersionRepoDbConfig.schema.commands.serviceIndex,
          serviceIndex,
        ),
      )
      .get();
    if (retained === undefined) {
      const chain = yield* ServiceVersionChain.getRepo({ key });
      const queue = yield* makeAsync(() => chain.executionResultsFanout);
      const page = yield* makeAsync(() =>
        queue.getPage({
          afterIndex: serviceIndex - 1,
          maxIndex: serviceIndex,
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
      retained = page.rows[0];
      rowTable = serviceVersionChainDbConfig.tables.commands;
    }
    if (retained === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-result-missing',
          message: 'Committed service result is missing',
        }),
      );
    }
    const executedCommand = yield* rowTable
      .decodeRow(retained)
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(
            Schema.toType(ServiceExecutedCommandSchema),
          ),
        ),
      )
      .pipe(
        mapParseError({
          code: 'service-result-invalid',
          prefix: 'Invalid committed service result',
        }),
      );
    return executedCommand;
  },
);
