import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAggregateId } from '@zerospin/core/models/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import config from 'config';
import { Effect } from 'effect';

import { ServiceVersionRepo } from '../ServiceVersionRepo/ServiceVersionRepo.js';

const { system } = config;

/*
 * SystemApi and aggregate definition calls route named service queries through
 * this worker operation. It requires definition context fields to be supplied
 * together when any are present; the service owner performs the query.
 *
 * 1. Detect supplied definition context.
 * 2. Reject partially supplied definition context.
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
  identity?: Readonly<Record<string, unknown>>;
  sessionName?: string;
  aggregateSessionLock?: IAggregateSessionLock;
  serviceName: string;
  queryName: string;
  params: unknown;
}) {
  const {
    aggregateSessionLock,
    aggregateId,
    aggregateName,
    sessionName,
    params,
    queryName,
    serviceName,
    identity,
    serviceVersion: inputServiceVersion,
    aggregateVersion,
  } = props;

  // 1 — inspect aggregateId, aggregateName, identity, sessionName, and aggregateSessionLock
  const hasAnySessionBinding =
    aggregateId !== undefined ||
    aggregateName !== undefined ||
    identity !== undefined ||
    sessionName !== undefined ||
    aggregateSessionLock !== undefined;

  // 2 — require all five fields together when any is present
  if (
    hasAnySessionBinding &&
    (aggregateId === undefined ||
      aggregateName === undefined ||
      identity === undefined ||
      sessionName === undefined ||
      aggregateSessionLock === undefined)
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-query-session-binding-incomplete',
        message:
          'A session-bound service query requires aggregateId, aggregateName, identity, sessionName, and aggregateSessionLock together',
      }),
    );
  }

  // 3 — use configured systemId and the caller serviceName
  const serviceVersion =
    aggregateName === undefined
      ? inputServiceVersion
      : (yield* getByKeyOrThrow({
          record: system.aggregates[aggregateName] ?? {},
          key: aggregateVersion ?? '',
          recordKind: 'aggregate versions',
        })).services[serviceName];
  yield* getByKeyOrThrow({
    record: system.services[serviceName] ?? {},
    key: serviceVersion ?? '',
    recordKind: 'service versions',
  });
  if (serviceVersion === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-version-required',
        message: 'An exact service version is required',
      }),
    );
  }
  const serviceRepo = yield* ServiceVersionRepo.getRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName,
      serviceVersion,
    },
  });

  // 4 — forward serviceName, queryName, and params to ServiceVersionRepo
  return yield* makeAsync<IRpcEnvelope<unknown, IZerospinErrorJson>>(() =>
    serviceRepo.executeServiceQuery({
      serviceName,
      queryName,
      params,
    }),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
});
