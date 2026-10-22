import { expect, it } from '@effect/vitest';
import * as sdk from '@zerospin/sdk';
import { makeSystemHarness } from '@zerospin/sdk/testing';
import { Effect } from 'effect';

import { system } from '../src/system';
import { userAggregateV1 } from '../src/aggregates/user/UserV1';

it.effect('creates a user through a command and rejects unauthenticated site creation', () =>
  Effect.gen(function* () {
    const harness = yield* makeSystemHarness({ system });
    yield* harness.push(yield* sdk.makeAggregateCommand(userAggregateV1, {
      aggregateId: 'acct_harness', contractName: 'createUser',
      payload: { id: 'usr_harness', clerkUserId: 'user_harness', username: null, displayName: null },
    }));
    const db = sdk.makeQueryDbVersion({ models: userAggregateV1.models });
    expect(yield* harness.query({ release: userAggregateV1, aggregateId: 'acct_harness' },
      db.query.user.findFirst({ where: { id: { eq: 'usr_harness' } } })))
      .toMatchObject({ clerkUserId: 'user_harness' });
    const rejected = yield* harness.push(yield* sdk.makeAggregateCommand(userAggregateV1, {
      aggregateId: 'acct_harness', contractName: 'createSite',
      payload: { id: 'sit_harness', userId: 'usr_harness', slug: 'example', name: null, description: null },
    })).pipe(Effect.flip);
    expect(rejected).toMatchObject({ code: 'create-site-user-mismatch' });
    yield* harness.flush();
    expect(yield* harness.query({ release: userAggregateV1, aggregateId: 'acct_harness' },
      db.query.site.findMany({}))).toEqual([]);
  }).pipe(Effect.provide(sdk.NanoIdFactory)));
