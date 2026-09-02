import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getMaterializedAggregateRepo } from '../MaterializedAggregateRepo/getMaterializedAggregateRepo/getMaterializedAggregateRepo.js';
import { MaterializedAggregateRepo } from '../MaterializedAggregateRepo/MaterializedAggregateRepo.js';
import { SelectedAggregateFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';

export const authorizeAggregateFrontend = Effect.fn(
  'SystemWorker.authorizeAggregateFrontend',
  { root: true },
)(function* (props: {
  userId: string;
  aggregateId: IAggregateId;
  aggregateName: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}): Effect.fn.Return<
  Readonly<{
    aggregateId: IAggregateId;
    aggregateName: string;
    userId: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    frontendSpec: IFrontendControllerSpec;
    systemVersion: string;
  }>,
  IAnyError,
  Async
> {
  const {
    userId,
    aggregateId,
    aggregateName,
    frontendName,
    aggregateFrontendLock,
  } = props;
  const systemSpec = makeSystemSpec({ system });
  const selectedUnknown = yield* validateAggregateFrontendLock({
    aggregateName,
    frontendName,
    aggregateFrontendLock,
  });
  const selected = yield* Schema.decodeUnknownEffect(
    SelectedAggregateFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected aggregate frontend lock',
    }),
  );
  const aggregateRepo = yield* getMaterializedAggregateRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      aggregateId,
      aggregateName,
    },
  });
  yield* makeAsync<
    Awaited<
      ReturnType<MaterializedAggregateRepo['authorizeAggregateFrontend']>
    >
  >(() =>
    aggregateRepo.authorizeAggregateFrontend({
      aggregateId,
      aggregateName,
      frontendName,
      userId,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return {
    aggregateId,
    aggregateName,
    userId,
    aggregateFrontendLock: selected.aggregateFrontendLock,
    frontendSpec: selected.frontendSpec,
    systemVersion: systemSpec.version,
  };
});
