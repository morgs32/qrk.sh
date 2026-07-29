/*
 * 1. Validate generation read admission and the deployed service target.
 * 2. Decode the untrusted signature with the bound frontend schema.
 * 3. Invoke the trusted ServiceRepo callback exactly once.
 * 4. Decode its returned actor ID before any actor-specific repo is derived.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IActorId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const authenticateServiceFrontend = Effect.fn(
  'SystemWorker.authenticateServiceFrontend',
  { root: true },
)(function* (props: {
  deployId: string;
  generationId: string;
  serviceName: string;
  actorName: string;
  frontendName: string;
  signature: unknown;
}): Effect.fn.Return<IActorId, IAnyError, Async> {
  // Checkpoint 1: authentication is a query-only read. A frozen generation is
  // still readable until routing switches and completion marks it drained.
  yield* makeAsync(() =>
    SystemRepo.getRepo({
      generationId: props.generationId,
    }).assertGenerationAdmission({
      deployId: props.deployId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  const serviceController = yield* getByKeyOrThrow({
    record: system.serviceControllers,
    key: props.serviceName,
    recordKind: 'service controllers',
  });
  const actorController = yield* getByKeyOrThrow({
    record: serviceController.actorControllers,
    key: props.actorName,
    recordKind: `actor controllers owned by service ${props.serviceName}`,
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: actorController.frontends,
    key: props.frontendName,
    recordKind: `frontends owned by service actor ${props.serviceName}.${props.actorName}`,
  });

  // Checkpoint 2: executable authentication receives a decoded value, never
  // the untrusted JSON value supplied to the dispatch gateway.
  const signature = yield* Schema.decodeUnknown(
    frontendBinding.frontendController.signature,
  )(props.signature).pipe(
    mapParseError({
      code: 'service-frontend-signature-invalid',
      prefix: `Failed to decode signature for ${props.serviceName}.${props.actorName}.${props.frontendName}`,
    }),
  );

  // Checkpoint 3: this singleton lookup is the first repo touched after target
  // and signature validation. No actor-specific projection is created here.
  const serviceRepo = yield* getServiceRepo({
    key: {
      generationId: props.generationId,
      serviceName: props.serviceName,
    },
  });
  const returnedActorId = yield* makeAsync(() =>
    serviceRepo.authenticateServiceFrontend({
      serviceName: props.serviceName,
      actorName: props.actorName,
      frontendName: props.frontendName,
      signature,
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  // Checkpoint 4: a malicious or defective callback cannot place arbitrary
  // text into a Durable Object name, registration, or service ticket target.
  return yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(returnedActorId).pipe(
    mapParseError({
      code: 'service-frontend-actor-id-invalid',
      prefix: 'Service frontend authentication returned an invalid actorId',
      extra: {
        serviceName: props.serviceName,
        actorName: props.actorName,
        frontendName: props.frontendName,
      },
    }),
  );
});
