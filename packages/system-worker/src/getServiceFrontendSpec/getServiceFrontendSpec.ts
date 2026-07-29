/*
 * Reads the complete client-safe spec for one deployed service frontend.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeServiceFrontendControllerSpec } from '@zerospin/core/serviceFrontendController/makeServiceFrontendControllerSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { system } from 'system';

import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const getServiceFrontendSpec = Effect.fn(
  'SystemWorker.getServiceFrontendSpec',
  { root: true },
)(function* (props: {
  deployId: string;
  generationId: string;
  serviceName: string;
  actorName: string;
  frontendName: string;
}): Effect.fn.Return<
  ReturnType<typeof makeServiceFrontendControllerSpec>,
  IAnyError,
  Async
> {
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

  return makeServiceFrontendControllerSpec(frontendBinding.frontendController);
});
