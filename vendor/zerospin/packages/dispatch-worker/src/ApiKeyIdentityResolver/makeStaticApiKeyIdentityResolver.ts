import type { ISystemId } from '@zerospin/core/system/types';
import { Effect, Layer } from 'effect';

import { ApiKeyIdentityResolver } from './ApiKeyIdentityResolver';

/**
 * Test/dev identity resolver: no verification, returns a fixed dev identity.
 * Callers may fix the key type for standalone Workers whose application-owned
 * key strings do not follow Zerospin's hosted key prefixes. When omitted, key
 * type remains derived from the key prefix (`sk_` = secret).
 */
export function makeStaticApiKeyIdentityResolver(
  props: {
    systemId?: string;
    deployName?: string;
    clerkUserId?: string;
    keyType?: 'secret' | 'publishable';
  } = {},
): Layer.Layer<ApiKeyIdentityResolver> {
  return Layer.sync(ApiKeyIdentityResolver, () => {
    const systemId =
      props.systemId ??
      process.env['ZEROSPIN_E2E_SYSTEM_ID'] ??
      process.env['ZEROSPIN_TEST_SYSTEM_ID'];
    if (systemId === undefined) {
      throw new Error(
        'makeStaticApiKeyIdentityResolver requires a systemId prop, ZEROSPIN_E2E_SYSTEM_ID, or ZEROSPIN_TEST_SYSTEM_ID.',
      );
    }
    const deployName =
      props.deployName ??
      process.env['ZEROSPIN_E2E_DEPLOY_NAME'] ??
      process.env['ZEROSPIN_TEST_DEPLOY_NAME'] ??
      'happy_blue_whale_ab';
    const clerkUserId =
      props.clerkUserId ??
      process.env['ZEROSPIN_E2E_CLERK_USER_ID'] ??
      process.env['ZEROSPIN_TEST_CLERK_USER_ID'] ??
      'user_e2e_test';
    return {
      resolve: ({ apiKey }) =>
        Effect.succeed({
          organizationId: 'org_test',
          // ALLOWED_CAST: test identities fabricate the branded id from an env string, matching the previous vi.mock.
          systemId: systemId as ISystemId,
          systemEnvironmentId: 'dev' as const,
          keyType:
            props.keyType ??
            (apiKey.startsWith('sk_')
              ? ('secret' as const)
              : ('publishable' as const)),
          keyPairName: deployName,
          clerkUserId,
        }),
    };
  });
}
