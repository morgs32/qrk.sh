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
import { Effect, Layer, Schema, type Scope } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeZerospinApp } from './makeZerospinApp';

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
const App = makeZerospinApp<typeof system>({
  systemName: 'typed-dates',
  layer,
});
const Selected = App.makeAggregateFrontend({
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
const SelectedService = App.makeServiceFrontend({
  serviceName: 'datedService',
  serviceVersion: '1.0.0',
  name: 'selected',
  authenticationSchema,
  models: { user: User },
});
assert<Equals<typeof SelectedService.models, { readonly user: typeof User }>>();
const correct = (
  <Selected
    generateSignature={() =>
      Effect.succeed({ aggregateId: 'acct_date', issuedAt: new Date() })
    }
  >
    {null}
  </Selected>
);
const incorrect = (
  <Selected
    generateSignature={() =>
      // @ts-expect-error The signer supplies a Date, not its persisted string.
      Effect.succeed({ aggregateId: 'acct_date', issuedAt: '' })
    }
  >
    {null}
  </Selected>
);
void [correct, incorrect];
App.makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'bad',
  models: {},
  contracts: {},
  // @ts-expect-error Both decoded and encoded claims must match the selected aggregate.
  authenticationSchema: Schema.Struct({
    aggregateId: Schema.String,
    issuedAt: Schema.String,
  }),
});
App.makeServiceFrontend({
  serviceName: 'datedService',
  serviceVersion: '1.0.0',
  name: 'bad',
  models: {},
  // @ts-expect-error Same decoded Date with a different encoded representation is incompatible.
  authenticationSchema: Schema.Struct({
    aggregateId: Schema.String,
    issuedAt: Schema.Date,
  }),
});
App.makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'bad',
  models: {},
  contracts: {},
  // @ts-expect-error Narrower claims do not accept the selected aggregate's complete claim type.
  authenticationSchema: Schema.Struct({
    aggregateId: Schema.Literal('acct_one'),
    issuedAt: Schema.DateFromString,
  }),
});

// @ts-expect-error Contract guard services must be supplied by an app or frontend layer.
App.makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'missing-services',
  authenticationSchema,
  models: {},
  contracts: { check: { contract: check } },
});
const Guarded = App.makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'guarded',
  authenticationSchema,
  models: {},
  contracts: { check: { contract: check } },
  guardLayer: () =>
    Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
});
assert<
  Equals<
    NonNullable<typeof Guarded.frontend.__initializeRequirements>,
    Scope.Scope
  >
>();
declare const providedGuardService: Layer.Success<
  ReturnType<NonNullable<typeof Guarded.frontend.guardLayer>>
>;
const exactGuardService: ApiRequestInit = providedGuardService;
const expectedGuardService: typeof providedGuardService = exactGuardService;
void expectedGuardService;
App.makeAggregateFrontend({
  aggregateName: 'dated',
  aggregateVersion: '1.0.0',
  name: 'wrong-services',
  authenticationSchema,
  models: {},
  contracts: { check: { contract: check } },
  // @ts-expect-error This guard layer does not provide the required ApiRequestInit.
  guardLayer: () => Layer.empty,
});
