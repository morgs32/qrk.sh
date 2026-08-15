import type { IUserRef } from '@zerospin/core/aggregate/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, type Schema } from 'effect';

import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const executeServiceQuery = Effect.fn(
  'SystemWorker.executeServiceQuery',
  { root: true },
)(function* (props: {
  generationId: string;
  actorRef?: IUserRef;
  frontendName?: string;
  aggregateFrontendLock?: Schema.Schema.Type<
    typeof AggregateFrontendLockSchema
  >;
  serviceName: string;
  queryName: string;
  params: unknown;
}) {
  const hasAnyFrontendBinding =
    props.actorRef !== undefined ||
    props.frontendName !== undefined ||
    props.aggregateFrontendLock !== undefined;
  if (
    hasAnyFrontendBinding &&
    (props.actorRef === undefined ||
      props.frontendName === undefined ||
      props.aggregateFrontendLock === undefined)
  ) {
    return yield* new ZerospinError({
      code: 'service-query-frontend-binding-incomplete',
      message:
        'A frontend-bound service query requires actorRef, frontendName, and aggregateFrontendLock together',
    });
  }
  if (
    props.actorRef !== undefined &&
    props.frontendName !== undefined &&
    props.aggregateFrontendLock !== undefined
  ) {
    yield* validateAggregateFrontendLock({
      aggregateName: props.actorRef.aggregateName,
      frontendName: props.frontendName,
      aggregateFrontendLock: props.aggregateFrontendLock,
    });
  }
  yield* makeAsync(() =>
    SystemRepo.getRepo({
      systemId: env.ZEROSPIN_SYSTEM_ID,
    }).assertGenerationAdmission({
      generationId: props.generationId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const serviceRepo = yield* getServiceRepo({
    key: {
      generationId: props.generationId,
      serviceName: props.serviceName,
    },
  });
  return yield* makeAsync(() =>
    serviceRepo.executeServiceQuery({
      serviceName: props.serviceName,
      queryName: props.queryName,
      params: props.params,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
