import type { IActor } from '@zerospin/core/actorController/types';
import { type Async } from '@zerospin/core/async/Async';
import type { IFrontendController } from '@zerospin/core/frontendController/types';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApisUrl } from '@zerospin/core/services/ZerospinApisUrl';
import type {
  ISystemEnvironmentId,
  ISystemId,
} from '@zerospin/core/system/types';
import type { IAnyError } from '@zerospin/error';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect, type Schema } from 'effect';

import { fetchFrontend } from './fetchFrontend';

export const authenticate = Effect.fn('authenticate')(function* <
  FRONTEND extends IFrontendController,
>(props: {
  frontend: FRONTEND;
  signature: Schema.Schema.Type<FRONTEND['signature']>;
}): Effect.fn.Return<
  {
    actor: IActor;
    deployId: string;
    generationId: string;
    systemId: ISystemId;
    systemVersion: string;
    systemWorkerName: string;
    systemEnvironmentId: ISystemEnvironmentId;
  },
  IAnyError,
  Async | PublishableKey | ZerospinApisUrl | TelemetryCollector
> {
  return yield* Effect.acquireUseRelease(
    fetchFrontend({
      frontend: props.frontend,
      generateSignature: () => Effect.succeed(props.signature),
    }),
    admitted =>
      Effect.succeed({
        actor: admitted.identity.actor,
        deployId: admitted.identity.deployId,
        generationId: admitted.identity.generationId,
        systemId: admitted.identity.systemId,
        systemVersion: admitted.identity.systemVersion,
        systemWorkerName: admitted.identity.systemWorkerName,
        systemEnvironmentId: admitted.identity.systemEnvironmentId,
      }),
    admitted => Effect.sync(admitted.releaseFrontendApi),
  );
}, annotateFunctionSpan);
