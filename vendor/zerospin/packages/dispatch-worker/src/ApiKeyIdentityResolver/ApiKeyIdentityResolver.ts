import type { Async } from '@zerospin/core/async/Async';
import type { IAnyError } from '@zerospin/error';
import { Context, type Effect } from 'effect';

import type { ICloudApiKeyIdentity } from '../CloudApiKeyJwtClaimsSchema';

export interface IApiKeyIdentityResolver {
  /** Resolve a zerospin api key (secret or publishable) into its identity claims. */
  readonly resolve: (props: {
    apiKey: string;
  }) => Effect.Effect<ICloudApiKeyIdentity, IAnyError, Async>;
}

export class ApiKeyIdentityResolver extends Context.Tag(
  'ApiKeyIdentityResolver',
)<ApiKeyIdentityResolver, IApiKeyIdentityResolver>() {}
