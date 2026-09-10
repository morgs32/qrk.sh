import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, type Schema } from 'effect';
import { system } from 'system';

import { VersionedServiceRepo } from '../VersionedServiceRepo/VersionedServiceRepo.js';

/*
 * SystemApi and aggregate frontend calls route named service queries through
 * this worker operation. It requires frontend context fields to be supplied
 * together when any are present; the service owner performs the query.
 *
 * 1. Detect supplied frontend context.
 * 2. Reject partially supplied frontend context.
 * 3. Resolve the requested service owner.
 * 4. Execute and decode the named service query.
 */
export const executeServiceQuery = Effect.fn(
  'SystemWorker.executeServiceQuery',
  { root: true },
)(function* (props: {
  aggregateId?: IAggregateId;
  aggregateName?: string;
  aggregateVersion?: string;
  serviceVersion?: string;
  userId?: string;
  frontendName?: string;
  aggregateFrontendLock?: Schema.Schema.Type<
    typeof AggregateFrontendLockSchema
  >;
  serviceName: string;
  queryName: string;
  params: unknown;
}) {
  const {
    aggregateFrontendLock,
    aggregateId,
    aggregateName,
    frontendName,
    params,
    queryName,
    serviceName,
    userId,
  } = props;

  // 1 — inspect aggregateId, aggregateName, userId, frontendName, and aggregateFrontendLock
  const hasAnyFrontendBinding =
    aggregateId !== undefined ||
    aggregateName !== undefined ||
    userId !== undefined ||
    frontendName !== undefined ||
    aggregateFrontendLock !== undefined;

  // 2 — require all five fields together when any is present
  if (
    hasAnyFrontendBinding &&
    (aggregateId === undefined ||
      aggregateName === undefined ||
      userId === undefined ||
      frontendName === undefined ||
      aggregateFrontendLock === undefined)
  ) {
    return yield* new ZerospinError({
      code: 'service-query-frontend-binding-incomplete',
      message:
        'A frontend-bound service query requires aggregateId, aggregateName, userId, frontendName, and aggregateFrontendLock together',
    });
  }

  // 3 — use configured systemId and the caller serviceName
  const serviceVersion =
    aggregateName === undefined
      ? props.serviceVersion
      : (yield* getByKeyOrThrow({
          record: system.aggregates[aggregateName] ?? {},
          key: props.aggregateVersion ?? '',
          recordKind: 'aggregate versions',
        })).services[serviceName];
  yield* getByKeyOrThrow({
    record: system.services[serviceName] ?? {},
    key: serviceVersion ?? '',
    recordKind: 'service versions',
  });
  if (serviceVersion === undefined) {
    return yield* new ZerospinError({
      code: 'service-version-required',
      message: 'An exact service version is required',
    });
  }
  const serviceRepo = yield* VersionedServiceRepo.getRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName,
      serviceVersion,
    },
  });

  // 4 — forward serviceName, queryName, and params to VersionedServiceRepo
  return yield* makeAsync<IEncodedResult<unknown, IAnyErrorJson>>(() =>
    serviceRepo.executeServiceQuery({
      serviceName,
      queryName,
      params,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
