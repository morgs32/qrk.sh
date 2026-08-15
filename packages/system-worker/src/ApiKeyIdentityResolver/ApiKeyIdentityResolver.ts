import type { Async } from '@zerospin/core/async/Async';
import type { ISystemId } from '@zerospin/core/system/types';
import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

export interface ICloudApiKeyIdentity {
  readonly systemId: ISystemId;
  readonly systemEnvironmentId: 'dev' | 'production';
  readonly keyType: 'secret' | 'publishable';
  readonly systemWorkerName: string;
}

export interface IApiKeyIdentityResolver {
  /** Resolve a zerospin api key (secret or publishable) into its identity claims. */
  readonly resolve: (props: {
    apiKey: string;
  }) => Effect.Effect<ICloudApiKeyIdentity, IAnyError, Async>;
}
