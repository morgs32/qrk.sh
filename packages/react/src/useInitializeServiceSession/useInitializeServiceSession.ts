'use client';

import type {
  IBrowserSessionFailureCallbacks,
  IBrowserSessionFailureSubscriptions,
} from '@zerospin/browser/failureTypes';
import type {
  IClaimsSchema,
  ISessionInitialization,
} from '@zerospin/core/identity/types';
import type { IServiceStageFailure } from '@zerospin/core/serviceSession/types';
import type { Schema } from 'effect';

import {
  useInitializeSessionLifecycle,
  type IInitializableSession,
} from '../useInitializeSessionLifecycle/useInitializeSessionLifecycle.js';

type IServiceInitializationProps<
  I extends IClaimsSchema,
  C extends Schema.Codec<unknown, unknown> | undefined,
> = {
  session: IInitializableSession<I, C> &
    IBrowserSessionFailureSubscriptions & {
      readonly definition: {
        kind: 'service';
        serviceName: string;
        serviceVersion: string;
      };
      onStageFailure(
        handler: (event: IServiceStageFailure) => void,
      ): () => void;
    };
  onStageFailure?: (event: IServiceStageFailure) => void;
} & IBrowserSessionFailureCallbacks &
  ISessionInitialization<NoInfer<I>, NoInfer<C>>;

/** Initializes a service browser session and owns its transient failure listeners. */
export function useInitializeServiceSession<
  I extends IClaimsSchema,
  C extends Schema.Codec<unknown, unknown> | undefined = undefined,
>(props: IServiceInitializationProps<I, C>): { isInitialized: boolean } {
  const { session } = props;
  return useInitializeSessionLifecycle(props, latest => [
    session.onStageFailure(event => latest()?.onStageFailure?.(event)),
    session.onAdmissionFailure(event => latest()?.onAdmissionFailure?.(event)),
    session.onExecutionFailure(event => latest()?.onExecutionFailure?.(event)),
    session.onSharedWorkerConnectionFailure(event =>
      latest()?.onSharedWorkerConnectionFailure?.(event),
    ),
    session.onSharedWorkerPersistenceFailure(event =>
      latest()?.onSharedWorkerPersistenceFailure?.(event),
    ),
    session.onAuthenticationFailure(event =>
      latest()?.onAuthenticationFailure?.(event),
    ),
    session.onServerProtocolFailure(event =>
      latest()?.onServerProtocolFailure?.(event),
    ),
  ]);
}
