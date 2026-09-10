import { makeAsync } from '@zerospin/core/async/makeAsync';
import { ServiceExecutionEntrySchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import { VersionedServiceChain } from '../../VersionedServiceChain/VersionedServiceChain.js';
import { versionedServiceRepoDbConfig } from '../versionedServiceRepoDbConfig.js';

/** Catch up through the subscriber and recover the requested terminal result. */
export const execute = Effect.fn('VersionedServiceRepo.execute')(
  function* (props: {
    serviceIndex: number;
    db: IDb;
    key: { systemId: string; serviceName: string; serviceVersion: string };
    subscriber: {
      catchup(index?: number): Promise<IEncodedResult<void, IAnyErrorJson>>;
    };
  }) {
    const { db, key } = props;
    if (!Number.isSafeInteger(props.serviceIndex) || props.serviceIndex < 1) {
      return yield* new ZerospinError({
        code: 'service-execute-index-invalid',
        message: 'Execution requires a positive index',
      });
    }
    yield* makeAsync(() => props.subscriber.catchup(props.serviceIndex)).pipe(
      Effect.flatMap(decodeRpc),
    );
    let retained = db
      .select()
      .from(versionedServiceRepoDbConfig.schema.results)
      .where(
        eq(
          versionedServiceRepoDbConfig.schema.results.outboxIndex,
          props.serviceIndex,
        ),
      )
      .get()?.entry;
    if (retained === undefined) {
      const chain = yield* VersionedServiceChain.getRepo({ key });
      const queue = yield* makeAsync(() => chain.replicaFanoutQueue);
      const page = yield* makeAsync(() =>
        queue.getPage({
          afterIndex: props.serviceIndex - 1,
          maxIndex: props.serviceIndex,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      retained = page.rows[0]?.entry;
    }
    if (retained === undefined) {
      return yield* new ZerospinError({
        code: 'service-result-missing',
        message: 'Committed service result is missing',
      });
    }
    const entry = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ServiceExecutionEntrySchema),
    )(retained).pipe(
      mapParseError({
        code: 'service-result-invalid',
        prefix: 'Invalid committed service result',
      }),
    );
    return entry.command;
  },
);
