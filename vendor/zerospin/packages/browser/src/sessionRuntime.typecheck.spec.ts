import { stageCommand } from '@zerospin/core/aggregateSession/stageCommand/stageCommand';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { prefixId } from '@zerospin/core/models/prefixId';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { primitives } from '@zerospin/schema';
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
  contracts: { guarded },
  claimsSchema: claims,
};
const liveAggregate = { ...aggregate, contracts: { guarded } };
const apiLayer = Layer.mergeAll(
  Layer.succeed(ZerospinApiUrl, 'http://test'),
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
);
const definition = {
  kind: 'aggregate' as const,
  aggregateName: aggregate.aggregateName,
  aggregateVersion: aggregate.aggregateVersion,
  actorName: aggregate.actorName,
  actorVersion: aggregate.actorVersion,
  sessionName: aggregate.sessionName,
  models: aggregate.models,
  contracts: aggregate.contracts,
  claimsSchema: claims,
};

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
    definition: {
      kind: 'aggregate' as const,
      aggregateName: 'test',
      aggregateVersion: '1.0.0',
      actorName: 'writer',
      actorVersion: '1.0.0',
      sessionName: 'test',
      models: {},
      contracts: {},
      claimsSchema: claims,
    },
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
      guarded: { models: {}, contracts: { guarded } },
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

// Flat standalone declarations retain command-name and payload validation.
export function checkFlatContractTypes() {
  const session = makeStandaloneSession({
    ...aggregate,
    key: 'flat-types',
    claims: { aggregateId: 'acct_test' },
    layer: Layer.succeed(Capability, { value: 1 }),
  });
  stageCommand({ session, contractName: 'guarded', payload: {} });
  // @ts-expect-error Unknown commands remain rejected.
  stageCommand({ session, contractName: 'missing', payload: {} });
  makeStandaloneSession({
    ...aggregate,
    key: 'wrong-key',
    claims: { aggregateId: 'acct_test' },
    layer: Layer.succeed(Capability, { value: 1 }),
    // @ts-expect-error Registry keys must match the contract command name.
    contracts: { wrong: guarded },
  });
  makeMockAggregateSession({
    definition: {
      ...definition,
      // @ts-expect-error Mock declarations enforce the same command key.
      contracts: { wrong: guarded },
    },
    claims: { aggregateId: 'acct_test' },
    layer: Layer.succeed(Capability, { value: 1 }),
  });
}

export function checkStandaloneModuleTypes() {
  const item = makeModelVersion(
    defineModel({ name: 'item', abbreviation: 'itm' }),
    {
      version: '1.0.0',
      attributes: { label: primitives.text() },
      indexes: [],
    },
  );
  const child = makeModelVersion(
    defineModel({ name: 'child', abbreviation: 'chd' }),
    {
      version: '1.0.0',
      attributes: {
        itemId: primitives.ref({
          table: item.table,
          relation: 'item',
          inverse: 'children',
        }),
      },
      indexes: [],
    },
  );
  const observed = makeContractVersion(defineContract('observed'), {
    version: '1.0.0',
    models: { item },
    payload: { label: primitives.text() },
    program: Effect.fn('observed')(function* (props) {
      const { models, payload } = props;
      return [
        yield* models.item.create({
          resourceId: prefixId(item, 'test'),
          attributes: { label: payload.label },
        }),
      ];
    }),
  });
  const base = {
    kind: aggregate.kind,
    aggregateName: aggregate.aggregateName,
    aggregateVersion: aggregate.aggregateVersion,
    actorName: aggregate.actorName,
    actorVersion: aggregate.actorVersion,
    sessionName: aggregate.sessionName,
    claimsSchema: claims,
    key: 'module-types',
    claims: { aggregateId: 'acct_test' },
  };
  const modules = {
    data: { models: { item }, contracts: {} },
    commands: { models: {}, contracts: { observed } },
    children: { models: { child }, contracts: {} },
  };
  const resource = {
    id: prefixId(item, 'test'),
    modelName: item.modelName,
    version: item.version,
    createdAt: new Date(),
    updatedAt: new Date(),
    label: 'Item',
  };
  const session = makeStandaloneSession({
    ...base,
    modules,
    resources: { item: [resource] },
  });
  const inferredItem: typeof item = session.definition.models.item;
  const inferredContract: typeof observed =
    session.definition.contracts.observed;
  stageCommand({
    session,
    contractName: 'observed',
    payload: { label: 'seen' },
  });
  // @ts-expect-error Composed commands preserve their payload schema.
  stageCommand({ session, contractName: 'observed', payload: { label: 42 } });
  // @ts-expect-error Composition does not widen the command names.
  stageCommand({ session, contractName: 'missing', payload: {} });
  // @ts-expect-error Composition does not widen the model names.
  void session.definition.models.missing;
  makeStandaloneSession({
    ...base,
    modules,
    // @ts-expect-error Fixture attributes come from the module's model.
    resources: { item: [{ ...resource, label: 42 }] },
  });
  makeStandaloneSession({
    ...base,
    modules,
    // @ts-expect-error Fixture keys must name composed models.
    resources: { missing: [] },
  });
  makeStandaloneSession({
    ...base,
    models: { item },
    modules: { children: modules.children },
  });
  makeStandaloneSession({
    ...base,
    models: { child },
    modules: { data: modules.data },
  });
  makeStandaloneSession({
    ...base,
    contracts: { observed },
    modules: { data: modules.data },
  });
  makeStandaloneSession({
    ...base,
    // @ts-expect-error References must resolve within the composed model collection.
    modules: { children: modules.children },
  });
  makeStandaloneSession({
    ...base,
    models: { item },
    // @ts-expect-error Local and module model names must be distinct.
    modules: { data: modules.data },
  });
  makeStandaloneSession({
    ...base,
    contracts: { observed },
    modules: {
      data: modules.data,
      // @ts-expect-error Local and module contract names must be distinct.
      commands: modules.commands,
    },
  });
  makeStandaloneSession({
    ...base,
    // @ts-expect-error Modules cannot repeat model names, even for identical objects.
    modules: { first: modules.data, second: modules.data },
  });
  makeStandaloneSession({
    ...base,
    models: { item },
    // @ts-expect-error Modules cannot repeat contract names.
    modules: { first: modules.commands, second: modules.commands },
  });
  makeStandaloneSession({
    ...base,
    modules: {
      data: modules.data,
      commands: {
        models: {},
        // @ts-expect-error Module contract keys must match their command names.
        contracts: { wrong: observed },
      },
    },
  });
  makeStandaloneSession({
    ...base,
    models: {
      other: makeModelVersion(
        defineModel({ name: 'other', abbreviation: 'oth' }),
        {
          version: '1.0.0',
          attributes: { label: primitives.text() },
          indexes: [],
        },
      ),
    },
    // @ts-expect-error Module contract mutations must use a composed model.
    modules: { commands: modules.commands },
  });
  const guardedModules = { commands: { models: {}, contracts: { guarded } } };
  const guardedSession = makeStandaloneSession({
    ...base,
    modules: guardedModules,
    layer: Layer.succeed(Capability, { value: 1 }),
  });
  const value: number = guardedSession.runtime.runSync(Capability).value;
  // @ts-expect-error Module guards require a supplying layer.
  makeStandaloneSession({ ...base, modules: guardedModules });
  makeStandaloneSession({
    ...base,
    modules: guardedModules,
    // @ts-expect-error An unrelated layer cannot supply a module guard's capability.
    layer: Layer.succeed(Unrelated, { label: 'unrelated' }),
  });
  return { inferredItem, inferredContract, value };
}
