import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { SelectedAggregateFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { VersionedAggregateRepo } from '../VersionedAggregateRepo/VersionedAggregateRepo.js';

/*
 * GatewayApi uses this operation to admit a aggregate frontend for an
 * authenticated userId and caller-selected owner/frontend fields.
 * The aggregate Repo runs authorization against its local resource state.
 *
 * 1. Validate the requested frontend lock.
 * 2. Decode the selected frontend definition.
 * 3. Resolve the current base version.
 * 4. Authorize against owner-local state.
 * 5. Return the admitted frontend definition.
 */
export const authorizeAggregateFrontend = Effect.fn(
  'SystemWorker.authorizeAggregateFrontend',
  { root: true },
)(function* (props: {
  userId: string;
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}): Effect.fn.Return<
  Readonly<{
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    userId: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    frontendSpec: IFrontendControllerSpec;
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

  // 1 — resolve the authored aggregate frontend and its supported lock
  const selectedUnknown = yield* validateAggregateFrontendLock({
    aggregateVersion: props.aggregateVersion,
    aggregateName,
    frontendName,
    aggregateFrontendLock,
  });

  // 2 — check the selected lock and frontendSpec shape before returning admission
  const selected = yield* Schema.decodeUnknownEffect(
    SelectedAggregateFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected aggregate frontend lock',
    }),
  );

  // 3 — read AggregateChain.getBaseAggregateVersion for the requested aggregate
  const aggregateVersion = props.aggregateVersion;
  const aggregateRepo = yield* VersionedAggregateRepo.getRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      aggregateId,
      aggregateName,
      aggregateVersion,
    },
  });
  yield* makeAsync<
    Awaited<ReturnType<VersionedAggregateRepo['authorizeAggregateFrontend']>>
  >(() =>
    aggregateRepo.authorizeAggregateFrontend({
      aggregateId,
      aggregateName,
      frontendName,
      userId,
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  // 5 — return the checked lock, frontendSpec
  return {
    aggregateVersion,
    aggregateId,
    aggregateName,
    userId,
    aggregateFrontendLock: selected.aggregateFrontendLock,
    frontendSpec: selected.frontendSpec,
  };
});
