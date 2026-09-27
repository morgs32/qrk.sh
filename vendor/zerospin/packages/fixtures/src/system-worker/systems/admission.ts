import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { makeService } from '@zerospin/core/service/make/makeService';
import { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
import { makeZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

const db = makeActorDbVersion({ models: {} });
const credentialsSchema = Schema.Struct({ token: Schema.String });
const aggregateIdentity = makeActorIdentity({
  claims: Schema.Struct({ aggregateId: Schema.String, subject: Schema.String }),
  actorPath: RoutePattern.parse('/:subject'),
});
const serviceIdentity = makeActorIdentity({
  claims: Schema.Struct({ subject: Schema.String }),
  actorPath: RoutePattern.parse('/:subject'),
});
const authenticate = ({
  credentials,
}: {
  credentials: typeof credentialsSchema.Type;
}) =>
  Effect.gen(function* () {
    if (credentials.token === 'deny') {
      return yield* Effect.fail(makeZerospinError('credentials-rejected'));
    }
    return {
      aggregateId: credentials.token === 'bad-id' ? 'invalid' : 'acct_server',
      subject: 'server',
    };
  });
export const admissionAggregate = makeAggregateVersion(
  defineAggregate({ name: 'admission' }),
  {
    version: '1.0.0',
    models: {},
    contracts: {},
    automations: {},
    actors: {
      direct: makeAggregateActorVersion(
        { name: 'direct' },
        {
          version: '1.0.0',
          db,
          identity: aggregateIdentity,
          authentication: 'none',
          contracts: {},
          queries: {},
        },
      ),
      verified: makeAggregateActorVersion(
        { name: 'verified' },
        {
          version: '1.0.0',
          db,
          identity: aggregateIdentity,
          authentication: { credentialsSchema, authenticate },
          contracts: {},
          queries: {},
        },
      ),
    },
  },
);
export const admissionService = makeService({
  name: 'admission',
  module: {
    '1.0.0': { models: {}, contracts: {}, automations: {} },
  },
  actors: {
    '1.0.0': {
      direct: makeServiceActorVersion(
        { name: 'direct' },
        {
          version: '1.0.0',
          db,
          identity: serviceIdentity,
          authentication: 'none',
          queries: {},
        },
      ),
      verified: makeServiceActorVersion(
        { name: 'verified' },
        {
          version: '1.0.0',
          db,
          identity: serviceIdentity,
          authentication: {
            credentialsSchema,
            authenticate: props =>
              authenticate(props).pipe(
                Effect.map(({ subject }) => ({ subject })),
              ),
          },
          queries: {},
        },
      ),
    },
  },
});
