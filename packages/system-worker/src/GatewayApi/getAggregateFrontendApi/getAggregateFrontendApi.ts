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
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  };
  runtime: ISystemRuntime;
}) {
  const { request, runtime } = props;
  return yield* Effect.gen(function* () {
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.Struct({
          publishableKey: Schema.String,
          systemName: Schema.String,
          authenticationLock: Schema.Unknown,
          signature: Schema.Unknown,
          aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
          aggregateName: Schema.String,
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
    const authorization = yield* authorizeAggregateFrontend({
      aggregateId: validated.aggregateId,
      aggregateName: validated.aggregateName,
      frontendName: validated.frontendName,
      aggregateFrontendLock,
      userId,
    });
    yield* checkAuthorization({
      kind: 'aggregate',
      authorization,
      userId,
      aggregateId: validated.aggregateId,
      aggregateName: validated.aggregateName,
      systemName: validated.systemName,
      frontendName: validated.frontendName,
      aggregateFrontendLock,
    });
    return new AggregateFrontendApi({
      authResults: {
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
    Effect.catch(error =>
      Effect.succeed(new AggregateFrontendApiFailure(error)),
    ),
  );
});
