import { Schema } from 'effect';
import '@zerospin/server-only';
import { mapValues } from 'es-toolkit';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { assertActorAsyncContracts } from '../../contracts/asyncContract.ts';
import { Contract } from '../../contracts/make/makeContractVersion.ts';
import type { IAnyContracts, IContract } from '../../contracts/types.ts';
import { assertValidModels } from '../../models/assertValidModels.ts';
import { Model } from '../../models/defineModel.ts';
import type { IAnyModels, IModel } from '../../models/types.ts';
import { ServiceActorVersionSchema } from '../../serviceActor/make/makeServiceActorVersion.ts';
import type { IAnyServiceActorVersion } from '../../serviceActor/types.ts';
import type {
  IAnyService,
  IAnyServiceQuery,
  IService,
  IServiceQuery,
} from '../types.ts';
const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);
const EffectSchemaSchema = Schema.declare(
  (input: unknown): input is Schema.Codec<unknown, unknown> =>
    Schema.isSchema(input),
);
const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);
const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IContract => input instanceof Contract,
);
const serviceSemVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ServiceVersionPropsSchema = Schema.Struct({
  version: Schema.String,
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  contracts: Schema.Record(Schema.String, CanonicalContractSchema),
  actors: Schema.optionalKey(
    Schema.Record(Schema.String, ServiceActorVersionSchema),
  ),
  queries: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        paramsSchema: EffectSchemaSchema,
        query: FunctionSchema,
      }),
    ),
  ),
});
class ServiceVersion {}
export const ServiceVersionSchema = Schema.declare(
  (input: unknown): input is IAnyService => input instanceof ServiceVersion,
);
/** Construct one complete service version from canonical declarations. */
export function makeServiceVersion<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContracts,
  const ACTORS extends Readonly<Record<string, IAnyServiceActorVersion>> = {},
  const VERSION extends string = string,
>(
  definition: Readonly<{
    name: NAME;
  }>,
  props: {
    version: VERSION;
    models: MODELS;
    contracts: CONTRACTS;
    actors?: ACTORS & {
      [K in keyof ACTORS]: {
        name: K;
      };
    };
    queries?: Readonly<Record<string, IServiceQuery<NoInfer<MODELS>>>>;
  },
): IService<
  NAME,
  MODELS,
  CONTRACTS,
  Record<string, IAnyServiceQuery>,
  ACTORS,
  VERSION
>;
export function makeServiceVersion(
  definition: Readonly<{
    name: string;
  }>,
  props: unknown,
): unknown {
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }), {
    onExcessProperty: 'error',
  })(definition);
  if (typeof props === 'object' && props !== null) {
    for (const [field, expected] of [
      ['models', Model],
      ['contracts', Contract],
    ] as const) {
      const declarations = Reflect.get(props, field);
      if (typeof declarations !== 'object' || declarations === null) continue;
      for (const value of Object.values(declarations)) {
        assertSameCoreInstance({
          value,
          expected,
          kind: field === 'models' ? 'Model' : 'Contract',
        });
      }
    }
  }
  const decoded = Schema.decodeUnknownSync(ServiceVersionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const { version, models, contracts, actors = {}, queries = {} } = decoded;
  const { name } = definition;
  if (!serviceSemVerPattern.test(version)) {
    throw new Error(`Invalid service version ${version}`);
  }
  assertActorAsyncContracts(contracts);
  assertValidModels({
    models,
    context: `makeServiceVersion: ${name}@${version}`,
  });
  for (const [contractName, contract] of Object.entries(contracts)) {
    if (contractName !== contract.commandName) {
      throw new Error(
        `Contract key ${contractName} must match ${contract.commandName}`,
      );
    }
    for (const model of [
      ...Object.values(contract.models),
      ...Object.values(contract.mapping?.models ?? {}),
    ]) {
      if (models[model.modelName] !== model) {
        throw new Error(
          `Contract ${contractName} model ${model.modelName} must belong to service ${name}@${version}`,
        );
      }
    }
  }
  for (const [actorName, actor] of Object.entries(actors)) {
    if (actorName !== actor.name) {
      throw new Error(`Actor key ${actorName} must match ${actor.name}`);
    }
    for (const [commandName, contract] of Object.entries(actor.contracts)) {
      if (contracts[commandName] !== contract) {
        throw new Error(
          `Actor ${actorName} contract ${commandName} must belong to service ${name}@${version}`,
        );
      }
    }
    for (const [modelName, model] of Object.entries(actor.db.models)) {
      if (models[modelName] !== model) {
        throw new Error(
          `Actor ${actorName} database model ${modelName} must reference ${name}@${version}`,
        );
      }
    }
    for (const [modelName, selection] of Object.entries(
      actor.capturedSelections,
    )) {
      if (models[modelName] !== selection.model) {
        throw new Error(
          `Actor ${actorName}.${modelName} must reference ${name}@${version}`,
        );
      }
    }
  }
  const resolvedQueries = mapValues(queries, (query, queryKey) => ({
    ...query,
    kind: 'service' as const,
    name: String(queryKey),
    serviceName: name,
  }));
  return Object.assign(new ServiceVersion(), {
    actors,
    name,
    version,
    models,
    contracts,
    queries: resolvedQueries,
  });
}
