import { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { authenticate } from '../../authenticate/authenticate.js';
import { authorizeServiceFrontend } from '../../authorizeServiceFrontend/authorizeServiceFrontend.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { ServiceFrontendApi } from '../../ServiceFrontendApi/ServiceFrontendApi.js';
import { ServiceFrontendApiFailure } from '../../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';
import { checkAuthentication } from '../checkAuthentication/checkAuthentication.js';
import { checkAuthorization } from '../checkAuthorization/checkAuthorization.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

/*
 * GatewayApi grants a service frontend capability after checking the submitted
 * locks, authentication result, and owner authorization. The capability binds
 * the configured systemId and authenticated userId to the admitted frontend.
 *
 * 1. Capture the request and runtime.
 * 2. Decode the request envelope.
 * 3. Decode both submitted locks.
 * 4. Authenticate the publishable-key caller.
 * 5. Authorize the requested frontend.
 * 6. Bind the successful capability.
 * 7. Return a failure capability on rejection.
 */
export const getServiceFrontendApi = Effect.fn(
  'GatewayApi.getServiceFrontendApi',
  { root: true },
)(function* (props: {
  request: {
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
    serviceName: string;
    serviceVersion: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  };
  runtime: ISystemRuntime;
}) {
  // 1 — keep the caller request separate from the runtime bound to the capability
  const { request, runtime } = props;
  return yield* Effect.gen(function* () {
    // 2 — reject unknown request fields before reading either lock
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.Struct({
          publishableKey: Schema.String,
          systemName: Schema.String,
          authenticationLock: Schema.Unknown,
          signature: Schema.Unknown,
          serviceName: Schema.String,
          serviceVersion: Schema.String,
          frontendName: Schema.String,
          serviceFrontendLock: Schema.Unknown,
        }),
      ),
    )(request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-service-frontend-api-props',
        prefix: 'Failed to decode getServiceFrontendApi arguments',
      }),
    );

    // 3 — validate AuthenticationLockSchema and ServiceFrontendLockSchema
    const authenticationLock = yield* Schema.decodeUnknownEffect(
      AuthenticationLockSchema,
    )(validated.authenticationLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'authentication-lock-invalid',
        prefix: 'getServiceFrontendApi received an invalid authentication lock',
      }),
    );
    const serviceFrontendLock = yield* Schema.decodeUnknownEffect(
      ServiceFrontendLockSchema,
    )(validated.serviceFrontendLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-frontend-lock-invalid',
        prefix:
          'getServiceFrontendApi received an invalid service frontend lock',
      }),
    );

    // 4 — validate the API key, adapt the signature, and check the returned userId and lock
    yield* checkPublishableApiKey(validated.publishableKey);
    const authentication = yield* authenticate({
      authenticationLock,
      signature: validated.signature,
    });
    const userId = yield* checkAuthentication({
      authentication,
      authenticationLock,
      systemName: validated.systemName,
    });

    // 5 — ask the owner to admit the frontend, then compare its returned target and lock
    const authorization = yield* authorizeServiceFrontend({
      serviceVersion: validated.serviceVersion,
      serviceName: validated.serviceName,
      frontendName: validated.frontendName,
      serviceFrontendLock,
      userId,
    });
    yield* checkAuthorization({
      kind: 'service',
      serviceVersion: validated.serviceVersion,
      authorization,
      userId,
      systemName: validated.systemName,
      serviceName: validated.serviceName,
      frontendName: validated.frontendName,
      serviceFrontendLock,
    });

    // 6 — retain the admitted lock, authenticated userId, and configured systemId
    return new ServiceFrontendApi({
      authResults: {
        serviceVersion: validated.serviceVersion,
        frontendName: validated.frontendName,
        serviceFrontendLock: authorization.serviceFrontendLock,
        serviceName: validated.serviceName,
        systemId: env.ZEROSPIN_SYSTEM_ID,
        userId,
      },
      runtime,
    });
  }).pipe(
    // 7 — preserve the admission error in ServiceFrontendApiFailure
    Effect.catch(error => Effect.succeed(new ServiceFrontendApiFailure(error))),
  );
});
