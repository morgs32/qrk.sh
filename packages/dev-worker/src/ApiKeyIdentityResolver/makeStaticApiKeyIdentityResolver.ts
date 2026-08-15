import type { ISystemId } from '@zerospin/core/system/types';
import { Effect } from 'effect';
import type {
  IApiKeyIdentityResolver,
  ICloudApiKeyIdentity,
} from 'system-worker/ApiKeyIdentityResolver/ApiKeyIdentityResolver';

/**
 * Test/dev identity resolver: no verification, returns a fixed dev identity.
 * Callers may fix the key type for standalone Workers whose application-owned
 * key strings do not follow Zerospin's hosted key prefixes. When omitted, key
 * type remains derived from the key prefix (`sk_` = secret).
 */
export function makeStaticApiKeyIdentityResolver(props: {
  systemId: ISystemId;
  keyType?: 'secret' | 'publishable';
  systemWorkerName?: string;
}): IApiKeyIdentityResolver {
  const { systemId } = props;
  return {
    resolve: ({ apiKey }) =>
      Effect.succeed({
        systemId,
        systemWorkerName: props.systemWorkerName ?? systemId,
        systemEnvironmentId: 'dev',
        keyType:
          props.keyType ??
          (apiKey.startsWith('sk_') ? 'secret' : 'publishable'),
      } satisfies ICloudApiKeyIdentity),
  };
}
