import { RoutePattern } from '@remix-run/route-pattern';
import { ContractError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import { describe, expect, it } from 'vitest';

import { makeAggregateActorVersion } from '../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { makeActorIdentity } from '../identity/make/makeActorIdentity/makeActorIdentity.ts';
import { defineModel } from '../models/defineModel.ts';
import { makeActorDbVersion } from '../models/make/makeActorDbVersion.ts';
import { makeModelVersion } from '../models/make/makeModelVersion.ts';

import { defineContract } from './defineContract.ts';
import {
  makeContractVersion,
  upgradeContractVersion,
} from './make/makeContractVersion.ts';
import { makeMutations } from './make/makeMutations.ts';
import { runContractGuard } from './runContractGuard.ts';

const userClaims = Schema.Struct({
  subject: Schema.String.check(Schema.isMinLength(1)),
});
const user = makeModelVersion(
  defineModel({ name: 'user', abbreviation: 'usr' }),
  {
    version: '1.0.0',
    attributes: { name: primitives.text() },
    indexes: [],
  },
);

// Compile-only coverage of contextual inference through Effect.fn, including upgrades.
export function checkClaimsInference() {
  const first = makeContractVersion(defineContract('renameUser'), {
    version: '1.0.0',
    claims: userClaims,
    models: { user },
    payload: { name: primitives.text() },
    guard: Effect.fn('renameUser.guard')(function* ({ claims, payload, db }) {
      assert<Equals<typeof claims.subject, string>>();
      assert<Equals<typeof payload.name, string>>();
      assert<Equals<keyof typeof db.query, 'user'>>();
      // @ts-expect-error Only declared claims are available.
      void claims.role;
      // @ts-expect-error Only declared payload fields are available.
      void payload.missing;
      // @ts-expect-error Only declared models are queryable.
      void db.query.missing;
      yield* Effect.void;
    }),
    program: Effect.fn('renameUser.program')(function* ({
      claims,
      payload,
      models,
      db,
    }) {
      assert<Equals<typeof claims.subject, string>>();
      assert<Equals<typeof payload.name, string>>();
      assert<Equals<keyof typeof models, 'user'>>();
      assert<Equals<keyof typeof db.query, 'user'>>();
      assert<Equals<keyof typeof db, 'query'>>();
      const row = db.query.user.findFirst().sync();
      if (row) {
        assert<Equals<typeof row.name, string>>();
      }
      // @ts-expect-error Programs cannot write directly.
      void db.insert;
      // @ts-expect-error Programs cannot query undeclared models.
      void db.query.missing;
      yield* Effect.void;
      return [];
    }),
  });
  const withFailures = makeContractVersion(defineContract('restricted'), {
    version: '1.0.0',
    claims: userClaims,
    payload: {},
    failures: { denied: ContractError.schema({ code: 'denied' }) },
  });
  upgradeContractVersion(withFailures, {
    version: '2.0.0',
    claims: userClaims,
    payload: {},
    up: ({ payload }) => Effect.succeed(payload),
    guard: Effect.fn('restrictedV2.guard')(function* ({ failures }) {
      return yield* failures.denied.make();
    }),
    program: Effect.fn('restrictedV2.program')(function* ({ failures }) {
      return yield* failures.denied.make();
    }),
  });
  upgradeContractVersion(first, {
    version: '2.0.0',
    claims: userClaims,
    payload: { nickname: primitives.text() },
    up: ({ payload }) => Effect.succeed({ ...payload, nickname: payload.name }),
    guard: Effect.fn('renameUserV2.guard')(function* ({ claims, payload, db }) {
      assert<Equals<typeof claims.subject, string>>();
      assert<Equals<typeof payload.nickname, string>>();
      assert<Equals<keyof typeof db.query, 'user'>>();
      // @ts-expect-error Upgrades retain the declared claims requirement.
      void claims.role;
      yield* Effect.void;
    }),
    program: ({ db }) => {
      assert<Equals<keyof typeof db.query, 'user'>>();
      assert<Equals<keyof typeof db, 'query'>>();
      return Effect.succeed([]);
    },
  });
  upgradeContractVersion(first, {
    version: '3.0.0',
    models: { user: null, member: user },
    payload: {},
    up: ({ payload }) => Effect.succeed(payload),
    program: ({ db }) => {
      assert<Equals<keyof typeof db.query, 'member'>>();
      return Effect.succeed([]);
    },
  });
}

describe('contract claims', () => {
  it('accepts additional actor claims and rejects incompatible requirements at composition', () => {
    const contract = makeContractVersion(defineContract('greet'), {
      version: '1.0.0',
      claims: userClaims,
      payload: {},
    });
    const db = makeActorDbVersion({ models: {} });
    const identity = makeActorIdentity({
      claims: Schema.Struct({
        ...userClaims.fields,
        aggregateId: Schema.String,
        role: Schema.String,
      }),
      actorPath: RoutePattern.parse('/:subject'),
    });
    expect(
      makeAggregateActorVersion(
        { name: 'user' },
        {
          version: '1.0.0',
          authentication: 'none',
          db,
          identity,
          contracts: { greet: contract },
          queries: {},
        },
      ).contracts.greet,
    ).toBe(contract);

    const incompatible = makeActorIdentity({
      claims: Schema.Struct({
        aggregateId: Schema.String,
        subject: Schema.Number,
      }),
      actorPath: RoutePattern.parse('/:aggregateId'),
    });
    expect(() =>
      makeAggregateActorVersion(
        { name: 'invalid' },
        {
          version: '1.0.0',
          authentication: 'none',
          db,
          identity: incompatible,
          // @ts-expect-error The actor cannot satisfy string subject claims.
          contracts: { greet: contract },
          queries: {},
        },
      ),
    ).toThrow('Incompatible claim subject');
  });

  it('validates actual claims before either guard or program, including refinements', async () => {
    const observed: string[] = [];
    const contract = makeContractVersion(defineContract('greet'), {
      version: '1.0.0',
      claims: userClaims,
      payload: {},
      guard: ({ claims }) =>
        Effect.sync(() => {
          observed.push(claims.subject);
        }),
      program: ({ claims }) =>
        Effect.sync(() => {
          observed.push(claims.subject);
          return [];
        }),
    });
    for (const claims of [{}, { subject: 42 }, { subject: '' }, null]) {
      const guarded = await Effect.runPromise(
        runContractGuard({
          contract,
          db: { query: {} },
          payload: {},
          claims,
        }).pipe(Effect.result),
      );
      expect(guarded).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'contract-claims-invalid' },
      });
      const programmed = await Effect.runPromise(
        makeMutations({
          db: { query: {} },
          contract,
          models: {},
          command: {
            id: 'cmd_test',
            commandName: 'greet',
            contractVersion: '1.0.0',
            payload: {},
          },
          claims,
        }).pipe(Effect.result),
      );
      expect(programmed).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'contract-claims-invalid' },
      });
    }
    expect(observed).toEqual([]);
    await Effect.runPromise(
      runContractGuard({
        contract,
        db: { query: {} },
        payload: {},
        claims: { subject: 'alice', role: 'admin' },
      }),
    );
    expect(observed).toEqual(['alice']);
  });

  it('preserves null claims for contracts without a claims schema', async () => {
    const observed: unknown[] = [];
    const contract = makeContractVersion(defineContract('internal'), {
      version: '1.0.0',
      payload: {},
      guard: ({ claims }) =>
        Effect.sync(() => {
          observed.push(claims);
        }),
      program: ({ claims }) =>
        Effect.sync(() => {
          observed.push(claims);
          return [];
        }),
    });
    await Effect.runPromise(
      runContractGuard({
        contract,
        db: { query: {} },
        payload: {},
        claims: null,
      }),
    );
    await Effect.runPromise(
      makeMutations({
        db: { query: {} },
        contract,
        models: {},
        command: {
          id: 'cmd_test',
          commandName: 'internal',
          contractVersion: '1.0.0',
          payload: {},
        },
        claims: null,
      }),
    );
    expect(observed).toEqual([null, null]);
  });
});
