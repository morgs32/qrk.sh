import { makeAggregateSessionDefinition } from '@zerospin/core/aggregateSession/make/makeAggregateSessionDefinition';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { Context, Effect, Layer, Redacted, Schema } from 'effect';

import { makeMockAggregateSession } from './makeMockSession/makeMockAggregateSession';
import { makeSession } from './makeSession/makeSession';
import { makeStandaloneSession } from './makeStandaloneSession/makeStandaloneSession';

class Capability extends Context.Service<Capability, { value: number }>()(
  'TypedSessionCapability',
) {}
class Unrelated extends Context.Service<Unrelated, { label: string }>()(
  'UnrelatedSessionCapability',
) {}
const claims = Schema.Struct({ aggregateId: Schema.String });

const guarded = makeContractVersion(defineContract('guarded'), {
  version: '1.0.0',
  models: {},
  payload: {},
  failures: {},
  guard: () => Capability.pipe(Effect.asVoid),
});
const aggregate = {
  kind: 'aggregate' as const,
  aggregateName: 'test',
  aggregateVersion: '1.0.0',
  actorName: 'writer',
  actorVersion: '1.0.0',
  sessionName: 'test',
  models: {},
  contracts: { guarded: { contract: guarded } },
  claimsSchema: claims,
};
const liveAggregate = { ...aggregate, contracts: { guarded } };
const apiLayer = Layer.mergeAll(
  Layer.succeed(ZerospinApiUrl, 'http://test'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);
const definition = makeAggregateSessionDefinition({
  aggregateName: aggregate.aggregateName,
  aggregateVersion: aggregate.aggregateVersion,
  actorName: aggregate.actorName,
  actorVersion: aggregate.actorVersion,
  sessionName: aggregate.sessionName,
  models: aggregate.models,
  contracts: aggregate.contracts,
  claimsSchema: claims,
});

// Compile-only public constructor and runtime inference checks.
export function checkSessionLayerTypes() {
  const live = makeSession({
    sharedWorker: () => {
      throw new Error('Worker construction is not expected during declaration');
    },
    ...liveAggregate,
    systemName: 'test',
    layer: Layer.mergeAll(apiLayer, Layer.succeed(Capability, { value: 1 })),
  });
  const value: number = live.runtime.runSync(Capability).value;
  const standalone = makeStandaloneSession({
    ...aggregate,
    key: 'test',
    claims: { aggregateId: 'acct_test' },
    layer: Layer.effect(
      Capability,
      Effect.promise(async () => ({ value })),
    ),
  });
  const mock = makeMockAggregateSession({
    definition,
    claims: { aggregateId: 'acct_test' },
    layer: Layer.effect(
      Capability,
      Effect.promise(async () => ({ value })),
    ),
  });
  const standaloneValue: number = standalone.runtime.runSync(Capability).value;
  const mockValue: number = mock.runtime.runSync(Capability).value;
  const defaults = makeStandaloneSession({
    ...aggregate,
    contracts: {},
    key: 'defaults',
    claims: { aggregateId: 'acct_test' },
  });
  const detached = makeMockAggregateSession({
    definition: makeAggregateSessionDefinition({
      aggregateName: 'test',
      aggregateVersion: '1.0.0',
      actorName: 'writer',
      actorVersion: '1.0.0',
      sessionName: 'test',
      models: {},
      contracts: {},
      claimsSchema: claims,
    }),
    claims: { aggregateId: 'acct_test' },
  });
  // @ts-expect-error Omitting the layer does not add arbitrary services.
  defaults.runtime.runSync(Capability);
  // @ts-expect-error Mock default layers also expose only framework services.
  detached.runtime.runSync(Capability);
  // @ts-expect-error Runtime services retain the supplied layer's exact output.
  live.runtime.runSync(Unrelated);
  // @ts-expect-error Guard dependencies must be supplied even without a program.
  makeSession({
    sharedWorker: () => {
      throw new Error('Worker construction is not expected during declaration');
    },
    ...liveAggregate,
    systemName: 'test',
    layer: apiLayer,
  });
  // @ts-expect-error Live configuration includes both URL and publishable key.
  makeSession({
    sharedWorker: () => {
      throw new Error('Worker construction is not expected during declaration');
    },
    ...liveAggregate,
    systemName: 'test',
    layer: Layer.succeed(Capability, { value }),
  });
  // @ts-expect-error Standalone guards require a supplying layer.
  makeStandaloneSession({
    ...aggregate,
    key: 'test',
    claims: { aggregateId: 'acct_test' },
  });
  // @ts-expect-error Mock guards require a supplying layer.
  makeMockAggregateSession({
    definition,
    claims: { aggregateId: 'acct_test' },
  });
  // @ts-expect-error Runtime ownership is read-only to callers.
  live.runtime = standalone.runtime;
  return { value, standaloneValue, mockValue };
}

export function checkAdmissionTypes() {
  const layer = Layer.mergeAll(
    apiLayer,
    Layer.succeed(Capability, { value: 1 }),
  );
  const direct = makeSession({
    sharedWorker: () => {
      throw new Error('Worker construction is not expected during declaration');
    },
    ...liveAggregate,
    systemName: 'test',
    layer,
  });
  void direct.initialize({ claims: { aggregateId: 'acct_test' } });
  void direct.initialize({
    // @ts-expect-error Direct sessions do not accept credentials.
    getCredentials: () => Effect.succeed({ token: 'token' }),
  });
  // @ts-expect-error Identity must satisfy the declared schema.
  void direct.initialize({ claims: { aggregateId: 42 } });
  const verified = makeSession({
    sharedWorker: () => {
      throw new Error('Worker construction is not expected during declaration');
    },
    ...liveAggregate,
    systemName: 'test',
    layer,
    credentialsSchema: Schema.Struct({ token: Schema.String }),
  });
  void verified.initialize({
    getCredentials: () => Effect.succeed({ token: 'token' }),
  });
  // @ts-expect-error Verified sessions cannot accept caller-supplied claims.
  void verified.initialize({ claims: { aggregateId: 'acct_test' } });
  void verified.initialize({
    // @ts-expect-error Credentials must satisfy the declared schema.
    getCredentials: () => Effect.succeed({ token: 42 }),
  });
  void verified.initialize({
    // @ts-expect-error Claims and credentials are mutually exclusive.
    claims: { aggregateId: 'acct_test' },
    getCredentials: () => Effect.succeed({ token: 'token' }),
  });
}

export function checkModuleLayerTypes() {
  const modular = {
    ...liveAggregate,
    contracts: {},
    modules: {
      guarded: { models: {}, contracts: { guarded }, automations: {} },
    },
    systemName: 'test',
  };
  const session = makeSession({
    sharedWorker: () => {
      throw new Error('Worker construction is not expected during declaration');
    },
    ...modular,
    layer: Layer.mergeAll(apiLayer, Layer.succeed(Capability, { value: 1 })),
  });
  const value: number = session.runtime.runSync(Capability).value;
  // @ts-expect-error Module contracts require the same guard capability as local contracts.
  makeSession({
    sharedWorker: () => {
      throw new Error('Worker construction is not expected during declaration');
    },
    ...modular,
    layer: apiLayer,
  });
  // @ts-expect-error Unknown contracts are not introduced by module composition.
  void session.definition.contracts.unknown;
  return value;
}
