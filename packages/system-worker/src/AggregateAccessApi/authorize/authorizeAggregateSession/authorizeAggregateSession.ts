import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAggregateId } from '@zerospin/core/models/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { type IAnyError, type IZerospinErrorJson } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { AggregateVersionRepo } from '../../../AggregateVersionRepo/AggregateVersionRepo.js';

import { validateAggregateSessionLock } from './validateAggregateSessionLock/validateAggregateSessionLock.js';

/*
 * GatewayApi uses this operation to admit a aggregate definition for an
 * admitted claims and caller-selected owner/definition fields.
 * The aggregate Repo runs authorization against its local resource state.
 *
 * 1. Validate the requested definition lock.
 * 2. Resolve the current base version.
 * 3. Authorize against owner-local state.
 * 4. Return the admitted session definition.
 */
export const authorizeAggregateSession = Effect.fn(
  'AggregateAccessApi.authorizeAggregateSession',
  { root: true },
)(function* (props: {
  claims: Readonly<Record<string, unknown>>;
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
}): Effect.fn.Return<
  Readonly<{
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    claims: Readonly<Record<string, unknown>>;
    aggregateSessionLock: IAggregateSessionLock;
    sessionSpec: IAggregateSessionSpec;
  }>,
  IAnyError | IZerospinErrorJson,
  Async
> {
  const {
    claims,
    aggregateId,
    aggregateName,
    sessionName,
    aggregateSessionLock,
    aggregateVersion,
  } = props;

  // 1 — resolve the authored aggregate definition and its supported lock
  const selected = yield* validateAggregateSessionLock({
    aggregateVersion,
    aggregateName,
    sessionName,
    aggregateSessionLock,
  });

  // 2 — read AggregateChain.getBaseAggregateVersion for the requested aggregate
  const aggregateRepo = yield* AggregateVersionRepo.getRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      aggregateId,
      aggregateName,
      aggregateVersion,
    },
  });
  // 3 — authorize against owner-local state
  yield* makeAsync<
    Awaited<ReturnType<AggregateVersionRepo['authorizeAggregateSession']>>
  >(() =>
    aggregateRepo.authorizeAggregateSession({
      actorName: aggregateSessionLock.actorName,
      actorVersion: aggregateSessionLock.actorVersion,
      aggregateId,
      aggregateName,
      sessionName,
      claims,
    }),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

  // 4 — return the checked lock and session spec
  return {
    aggregateVersion,
    aggregateId,
    aggregateName,
    claims,
    aggregateSessionLock: selected.aggregateSessionLock,
    sessionSpec: selected.sessionSpec,
  };
});
