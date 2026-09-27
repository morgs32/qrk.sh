import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { type IAnyError, type IZerospinErrorJson } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { ServiceVersionRepo } from '../../../ServiceVersionRepo/ServiceVersionRepo.js';

import { validateServiceSessionLock } from './validateServiceSessionLock/validateServiceSessionLock.js';

/*
 * GatewayApi uses this operation to admit a service definition for an
 * admitted identity and caller-selected owner/definition fields.
 * The service Repo runs authorization against its local resource state.
 *
 * 1. Validate the requested definition lock.
 * 2. Authorize against owner-local state.
 * 3. Return the admitted session definition.
 */
export const authorizeServiceSession = Effect.fn(
  'ServiceAccessApi.authorizeServiceSession',
  { root: true },
)(function* (props: {
  identity: Readonly<Record<string, unknown>>;
  serviceName: string;
  serviceVersion: string;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
}): Effect.fn.Return<
  Readonly<{
    identity: Readonly<Record<string, unknown>>;
    serviceSessionLock: IServiceSessionLock;
    sessionSpec: IServiceSessionSpec;
  }>,
  IAnyError | IZerospinErrorJson,
  Async
> {
  const {
    identity,
    serviceName,
    sessionName,
    serviceSessionLock,
    serviceVersion,
  } = props;

  // 1 — resolve the authored service definition and its supported lock
  const selected = yield* validateServiceSessionLock({
    serviceVersion,
    serviceName,
    sessionName,
    serviceSessionLock,
  });

  // 2 — open the service Repo and run authorizeServiceSession with the admitted identity
  const serviceRepo = yield* ServiceVersionRepo.getRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID, serviceName, serviceVersion },
  });
  yield* makeAsync<
    Awaited<ReturnType<ServiceVersionRepo['authorizeServiceSession']>>
  >(() =>
    serviceRepo.authorizeServiceSession({
      actorName: serviceSessionLock.actorName,
      actorVersion: serviceSessionLock.actorVersion,
      serviceName,
      sessionName,
      identity,
    }),
  ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));

  // 3 — return the checked lock and session spec
  return {
    identity,
    serviceSessionLock: selected.serviceSessionLock,
    sessionSpec: selected.sessionSpec,
  };
});
