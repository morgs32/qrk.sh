import { AuthenticationLockSchema } from '@zerospin/core/authentication/makeAuthenticationLock';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { mapParseError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { AggregateFrontendApi } from '../../AggregateFrontendApi/AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from '../../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import { authenticate } from '../../authenticate/authenticate.js';
import { authorizeAggregateFrontend } from '../../authorizeAggregateFrontend/authorizeAggregateFrontend.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { checkAuthentication } from '../checkAuthentication/checkAuthentication.js';
import { checkAuthorization } from '../checkAuthorization/checkAuthorization.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

/*
 * GatewayApi grants a aggregate frontend capability after checking the submitted
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
export const getAggregateFrontendApi = Effect.fn(
  'GatewayApi.getAggregateFrontendApi',
  { root: true },
)(function* (props: {
  request: {
    publishableKey: string;
    systemName: string;
    authenticationLock: Schema.Schema.Type<typeof AuthenticationLockSchema>;
    signature: unknown;
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
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
          aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
          aggregateName: Schema.String,
          aggregateVersion: Schema.String,
          frontendName: Schema.String,
          aggregateFrontendLock: Schema.Unknown,
        }),
      ),
    )(request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-aggregate-frontend-api-props',
        prefix: 'Failed to decode getAggregateFrontendApi arguments',
      }),
    );

    // 3 — validate AuthenticationLockSchema and AggregateFrontendLockSchema
    const authenticationLock = yield* Schema.decodeUnknownEffect(
      AuthenticationLockSchema,
    )(validated.authenticationLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'authentication-lock-invalid',
        prefix:
          'getAggregateFrontendApi received an invalid authentication lock',
      }),
    );
    const aggregateFrontendLock = yield* Schema.decodeUnknownEffect(
      AggregateFrontendLockSchema,
    )(validated.aggregateFrontendLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-lock-invalid',
        prefix:
          'getAggregateFrontendApi received an invalid aggregate frontend lock',
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
    const authorization = yield* authorizeAggregateFrontend({
      aggregateVersion: validated.aggregateVersion,
      aggregateId: validated.aggregateId,
      aggregateName: validated.aggregateName,
      frontendName: validated.frontendName,
      aggregateFrontendLock,
      userId,
    });
    yield* checkAuthorization({
      kind: 'aggregate',
      aggregateVersion: validated.aggregateVersion,
      authorization,
      userId,
      aggregateId: validated.aggregateId,
      aggregateName: validated.aggregateName,
      systemName: validated.systemName,
      frontendName: validated.frontendName,
      aggregateFrontendLock,
    });

    // 6 — bind the admitted fields into the successful capability
    return new AggregateFrontendApi({
      authResults: {
        aggregateVersion: validated.aggregateVersion,
        aggregateId: authorization.aggregateId,
        aggregateName: authorization.aggregateName,
        userId: authorization.userId,
        aggregateFrontendLock: authorization.aggregateFrontendLock,
        frontendName: validated.frontendName,
        systemId: env.ZEROSPIN_SYSTEM_ID,
      },
      runtime,
    });
  }).pipe(
    // 7 — preserve the admission error in AggregateFrontendApiFailure
    Effect.catch(error =>
      Effect.succeed(new AggregateFrontendApiFailure(error)),
    ),
  );
});
