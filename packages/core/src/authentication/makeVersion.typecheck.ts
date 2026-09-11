import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeSystem } from '../system/makeSystem.ts';

import { makeAuthenticationVersion } from './makeVersion.ts';

const UserId = Schema.String.pipe(Schema.brand('UserId'));
const v1 = makeAuthenticationVersion({
  version: '1.0.0',
  signature: Schema.Struct({ userId: UserId }),
  authenticate: ({ signature }) => {
    assert<Equals<typeof signature.userId, typeof UserId.Type>>();
    return Effect.succeed(signature.userId);
  },
  onAuthentication: Effect.fn('test.onAuthentication')(function* ({
    userId,
    executeAggregateCommand,
  }) {
    assert<Equals<typeof userId, string>>();
    const result = yield* executeAggregateCommand({
      id: 'cmd_test',
      commandName: 'createUser',
      contractVersion: '1.0.0',
      payload: '{}',
      aggregateId: 'acct_user',
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
      systemName: 'auth',
      userId: null,
      sessionId: null,
      frontendName: null,
      pushIndex: null,
    });
    assert<Equals<typeof result.aggregateIndex, number>>();
  }),
});
const v2 = makeAuthenticationVersion({
  version: '2.0.0',
  signature: Schema.Struct({ subject: Schema.String }),
  authenticate: ({ signature }) => Effect.succeed(signature.subject),
});
const system = makeSystem({
  name: 'auth',
  authentication: [v1, v2],
  aggregates: {},
});
assert<Equals<typeof v1.version, '1.0.0'>>();
assert<
  Equals<Effect.Success<ReturnType<typeof v1.authenticate>>, typeof UserId.Type>
>();
assert<Equals<typeof system.authentication, readonly [typeof v1, typeof v2]>>();

// @ts-expect-error versions are immutable
v1.version = '1.0.0';
// @ts-expect-error signature input must match the selected schema
v1.authenticate({ signature: { subject: 'user' } });
makeAuthenticationVersion({
  version: '1.0.0',
  signature: Schema.String,
  // @ts-expect-error authentication must return a user ID string
  authenticate: () => Effect.succeed(1),
});
