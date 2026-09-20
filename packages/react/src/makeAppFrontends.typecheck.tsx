import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeAggregateVersion';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/makeContractVersion';
import { Account, User } from '@zerospin/core/fixtures/system';
import { makeService } from '@zerospin/core/service/makeService';
import { ApiRequestInit } from '@zerospin/core/services/ApiRequestInit';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import type { IAnyError } from '@zerospin/error';
import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeAggregateFrontend } from './makeAggregateFrontend/makeAggregateFrontend';
import { makeRuntime } from './makeRuntime/makeRuntime';
import { makeServiceFrontend } from './makeServiceFrontend/makeServiceFrontend';
import { makeSession } from './makeSession/makeSession';
import { useInitializeSession } from './useInitializeSession/useInitializeSession';
import { useLiveQuery } from './useLiveQuery';

const signatureSchema = Schema.Struct({
  aggregateId: Schema.String,
  issuedAt: Schema.DateFromString,
});
const authenticationSchema = Schema.Struct({
  aggregateId: Schema.String,
  issuedAt: Schema.DateFromString,
});
const authentication = {
  signatureSchema,
  authenticationSchema,
  selectionSchema: Schema.Struct({ aggregateId: Schema.String }),
  pattern: RoutePattern.parse('/:aggregateId'),
  authenticate: ({ signature }: { signature: typeof signatureSchema.Type }) =>
    Effect.succeed(signature),
};
const check = makeContractVersion(defineContract('check'), {
  version: '1.0.0',
  payload: {},
  guard: () => Effect.asVoid(ApiRequestInit),
});
const aggregate = makeAggregateVersion(
  defineAggregate({
    name: 'dated',
    layer: Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
  }),
  {
    ...authentication,
    version: '1.0.0',
    models: { account: Account, user: User },
    contracts: { check: { contract: check } },
    selections: {},
  },
);
const service = makeService({
  ...authentication,
  name: 'datedService',
  version: '1.0.0',
  models: { account: Account, user: User },
  contracts: {},
});
const system = makeSystem({
  name: 'typed-dates',
  aggregates: { dated: [aggregate] },
  services: { datedService: [service] },
});
declare const layer: Layer.Layer<PublishableKey | ZerospinApiUrl, IAnyError>;
const runtime = makeRuntime({ layer });

const Selected = makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'selected',
  authenticationSchema,
  models: { account: Account },
  contracts: {},
  guardLayer: ({ db, authentication }) => {
    assert<
      Equals<typeof authentication, typeof authenticationSchema.Type | null>
    >();
    void db.query.account.findMany();
    // @ts-expect-error The selected database excludes user.
    void db.query.user;
    return Layer.empty;
  },
});
assert<Equals<typeof Selected.models, { readonly account: typeof Account }>>();
const SelectedService = makeServiceFrontend({
  serviceName: 'datedService',
  serviceVersion: '1.0.0',
  name: 'selected',
  authenticationSchema,
  models: { user: User },
});
assert<Equals<typeof SelectedService.models, { readonly user: typeof User }>>();

const session = makeSession({
  frontend: Selected,
  runtime,
  systemName: 'typed-dates',
});

const localNeedsRequestInit = Layer.effect(
  CuidFactory,
  Effect.as(ApiRequestInit, () => Effect.succeed('id')),
);
makeSession({
  // @ts-expect-error Local layer inputs must be supplied by the shared runtime.
  frontend: Selected,
  runtime,
  // @ts-expect-error Local layer inputs must be supplied by the shared runtime.
  layer: localNeedsRequestInit,
  systemName: 'typed-dates',
});
const runtimeWithRequestInit = makeRuntime({
  layer: Layer.mergeAll(
    layer,
    Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
  ),
});
makeSession({
  frontend: Selected,
  runtime: runtimeWithRequestInit,
  layer: localNeedsRequestInit,
  systemName: 'typed-dates',
});
makeRuntime<ApiRequestInit>({
  // @ts-expect-error Explicit application services must actually be supplied.
  layer,
});

const correctInit = session.initialize<typeof system>({
  generateSignature: () =>
    Effect.succeed({ aggregateId: 'acct_date', issuedAt: new Date() }),
});
void correctInit;

session.initialize<typeof system>({
  generateSignature: () =>
    // @ts-expect-error The signer supplies a Date, not its persisted string.
    Effect.succeed({ aggregateId: 'acct_date', issuedAt: '' }),
});

makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'bad',
  models: {},
  contracts: {},
  // Runtime validation still requires aggregateId; types do not encode that yet.
  authenticationSchema: Schema.Struct({
    issuedAt: Schema.DateFromString,
  }),
});

// @ts-expect-error Contract guard services must be supplied by a guard layer.
makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'missing-services',
  authenticationSchema,
  models: {},
  contracts: { check: { contract: check } },
});
const Guarded = makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'guarded',
  authenticationSchema,
  models: {},
  contracts: { check: { contract: check } },
  guardLayer: () =>
    Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
});
declare const providedGuardService: Layer.Success<
  ReturnType<NonNullable<typeof Guarded.guardLayer>>
>;
const exactGuardService: ApiRequestInit = providedGuardService;
const expectedGuardService: typeof providedGuardService = exactGuardService;
void expectedGuardService;
makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'wrong-services',
  authenticationSchema,
  models: {},
  contracts: { check: { contract: check } },
  // @ts-expect-error This guard layer does not provide the required ApiRequestInit.
  guardLayer: () => Layer.empty,
});

function Consumer() {
  useInitializeSession<typeof system>({
    session,
    generateSignature: () =>
      Effect.succeed({ aggregateId: 'acct_date', issuedAt: new Date() }),
  });
  useLiveQuery({
    session,
    query: db => db.query.account.findMany(),
  });
  useLiveQuery({
    session,
    // @ts-expect-error The selected models do not contain this table.
    query: db => db.query.user.findMany(),
  });
  return null;
}
void Consumer;
