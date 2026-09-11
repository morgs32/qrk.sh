import { RoutePattern } from '@remix-run/route-pattern';
import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer, Schema, type Scope } from 'effect';
import { expectTypeOf } from 'vitest';

import { initializeGuards } from '../aggregate/initializeGuards.ts';
import { makeAggregate } from '../aggregate/makeAggregate.ts';
import {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from '../aggregate/makeVersion.ts';
import { defineCommand } from '../contracts/Command.ts';
import { makeContractVersion } from '../contracts/makeVersion.ts';
import { User } from '../fixtures/system.ts';
import { makeSelection } from '../models/makeSelection.ts';

import type { IAuthentication } from './types.ts';

const subject = Schema.String.pipe(Schema.brand('Subject'));
const signatureSchema = Schema.Struct({ subject });
const authenticationSchema = Schema.Struct({
  aggregateId: Schema.String,
  subject,
  role: Schema.String,
});
const selectionSchema = Schema.Struct({ subject });
const declaration = {
  signatureSchema,
  authenticationSchema,
  selectionSchema,
  pattern: RoutePattern.parse('/:subject'),
  authenticate: ({ signature }) => {
    expectTypeOf(signature.subject).toEqualTypeOf<typeof subject.Type>();
    return Effect.succeed({
      aggregateId: 'acct_test',
      subject: signature.subject,
      role: 'admin',
    });
  },
} satisfies IAuthentication<
  typeof signatureSchema,
  typeof authenticationSchema,
  typeof selectionSchema,
  '/:subject'
>;

const aggregate = makeAggregateVersion(makeAggregate({ name: 'auth' }), {
  version: '1.0.0',
  authentication: declaration,
  models: {},
  contracts: {},
  selections: {},
  authorize: ({ authentication }) => {
    expectTypeOf(authentication.role).toEqualTypeOf<string>();
    return Effect.void;
  },
});
expectTypeOf(aggregate.authentication.authenticationSchema.Type).toEqualTypeOf<
  typeof authenticationSchema.Type
>();

makeAggregateVersion(makeAggregate({ name: 'auth' }), {
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
  authentication: {
    ...declaration,
    // @ts-expect-error Aggregate authentication must supply aggregateId.
    authenticationSchema: signatureSchema,
    authenticate: ({ signature }) => Effect.succeed(signature),
  },
});
makeAggregateVersion(makeAggregate({ name: 'auth' }), {
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
  authentication: {
    ...declaration,
    // @ts-expect-error The route parameters must exactly match selection fields.
    pattern: RoutePattern.parse('/:other'),
  },
});
makeAggregateVersion(makeAggregate({ name: 'auth' }), {
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
  authentication: {
    ...declaration,
    // @ts-expect-error Optional path segments are unsupported.
    pattern: RoutePattern.parse('(/:subject)'),
  },
});
const widened: string = '/:subject';
makeAggregateVersion(makeAggregate({ name: 'auth' }), {
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
  authentication: {
    ...declaration,
    // @ts-expect-error A route pattern must retain its literal source.
    pattern: RoutePattern.parse(widened),
  },
});
const numeric = Schema.Struct({ subject: Schema.Number });
// @ts-expect-error Selection values must be required encoded and decoded strings.
const invalidSelection: IAuthentication<
  typeof signatureSchema,
  typeof authenticationSchema,
  typeof numeric,
  '/:subject'
>['selectionSchema'] = numeric;
void invalidSelection;
const missing = Schema.Struct({ missing: Schema.String });
// @ts-expect-error Selected fields must exist in full authentication.
const missingSelection: IAuthentication<
  typeof signatureSchema,
  typeof authenticationSchema,
  typeof missing,
  '/:missing'
>['selectionSchema'] = missing;
void missingSelection;

const changed = upgradeAggregateVersion(aggregate, {
  version: '2.0.0',
  authentication: {
    signatureSchema: Schema.Struct({ token: Schema.String }),
    authenticationSchema: Schema.Struct({
      aggregateId: Schema.String,
      tenant: Schema.String,
    }),
    selectionSchema: Schema.Struct({ tenant: Schema.String }),
    pattern: RoutePattern.parse('/tenant/:tenant'),
    authenticate: ({ signature }) =>
      Effect.succeed({ aggregateId: 'acct_next', tenant: signature.token }),
  },
});
expectTypeOf(changed.authentication.authenticationSchema.Type).toEqualTypeOf<{
  readonly aggregateId: string;
  readonly tenant: string;
}>();

makeAggregateVersion(makeAggregate({ name: 'selected' }), {
  version: '1.0.0',
  authentication: declaration,
  models: { user: User },
  contracts: {},
  selections: {
    user: makeSelection({
      model: User,
      where: ({
        authentication,
      }: {
        authentication: typeof selectionSchema.Type;
      }) => {
        expectTypeOf(authentication.subject).toEqualTypeOf<
          typeof subject.Type
        >();
        // @ts-expect-error Full-only claims are unavailable to selection callbacks.
        void authentication.role;
        return {};
      },
    }),
  },
});
const guarded = makeAggregateVersion(makeAggregate({ name: 'guarded' }), {
  version: '1.0.0',
  authentication: declaration,
  models: {},
  selections: {},
  guardLayer: ({ authentication }) => {
    expectTypeOf(authentication).toEqualTypeOf<
      typeof authenticationSchema.Type | null
    >();
    return Layer.succeed(CuidFactory, () => Effect.succeed('command-id'));
  },
  contracts: {
    guarded: {
      contract: makeContractVersion(defineCommand('guarded'), {
        version: '1.0.0',
        payload: {},
        guard: () => Effect.asVoid(CuidFactory),
      }),
    },
  },
});
const initialized: Effect.Effect<unknown, unknown, Scope.Scope> =
  initializeGuards(guarded);
void initialized;
