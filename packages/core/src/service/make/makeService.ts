import '@zerospin/server-only';
import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import { Contract } from '../../contracts/make/makeContractVersion.ts';
import type { IContract } from '../../contracts/types.ts';
import { assertValidModels } from '../../models/assertValidModels.ts';
import { Model } from '../../models/defineModel.ts';
import type { IModel } from '../../models/types.ts';
import type { IAnyDeclarationModule } from '../../module/types.ts';
import { ServiceActorVersionSchema } from '../../serviceActor/make/makeServiceActorVersion.ts';
import type { IAnyServiceActorVersion } from '../../serviceActor/types.ts';
import type {
  IAnyService,
  IAnyVersionedService,
  IServiceQuery,
  IVersionedService,
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
const ModuleSchema = Schema.Struct({
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  contracts: Schema.Record(Schema.String, CanonicalContractSchema),
});
const serviceSemVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ServicePropsSchema = Schema.Struct({
  name: Schema.String,
  module: Schema.Record(Schema.String, ModuleSchema),
  actors: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Record(Schema.String, ServiceActorVersionSchema),
    ),
  ),
  queries: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Record(
        Schema.String,
        Schema.Struct({
          paramsSchema: EffectSchemaSchema,
          query: FunctionSchema,
        }),
      ),
    ),
  ),
});

class Service {}
class VersionedService {}

export const ServiceSchema = Schema.declare(
  (input: unknown): input is IAnyService => input instanceof Service,
);
export const VersionedServiceSchema = Schema.declare(
  (input: unknown): input is IAnyVersionedService =>
    input instanceof VersionedService,
);

/** Install each complete domain composition under its selected service version. */
export function makeService<
  const NAME extends string,
  const MODULES extends Readonly<Record<string, IAnyDeclarationModule>>,
  const ACTORS extends Partial<
    Record<
      keyof MODULES & string,
      Readonly<Record<string, IAnyServiceActorVersion>>
    >
  > = {},
>(props: {
  name: NAME;
  module: MODULES;
  actors?: ACTORS;
  queries?: Partial<{
    [V in keyof MODULES & string]: Readonly<
      Record<string, IServiceQuery<MODULES[V]['models']>>
    >;
  }>;
}): IVersionedService<NAME, MODULES, ACTORS>;

export function makeService(props: unknown): unknown {
  if (typeof props === 'object' && props !== null && 'module' in props) {
    const modules = props.module;
    if (typeof modules === 'object' && modules !== null) {
      for (const declaration of Object.values(modules)) {
        if (typeof declaration !== 'object' || declaration === null) continue;
        const models = 'models' in declaration ? declaration.models : undefined;
        const contracts =
          'contracts' in declaration ? declaration.contracts : undefined;
        if (typeof models === 'object' && models !== null) {
          for (const model of Object.values(models)) {
            assertSameCoreInstance({ value: model, expected: Model, kind: 'Model' });
          }
        }
        if (typeof contracts === 'object' && contracts !== null) {
          for (const contract of Object.values(contracts)) {
            assertSameCoreInstance({
              value: contract,
              expected: Contract,
              kind: 'Contract',
            });
          }
        }
      }
    }
  }
  const decoded = Schema.decodeUnknownSync(ServicePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const {
    name,
    module: modules,
    actors: actorVersions = {},
    queries: queryVersions = {},
  } = decoded;
  for (const version of [
    ...Object.keys(actorVersions),
    ...Object.keys(queryVersions),
  ]) {
    if (modules[version] === undefined) {
      throw new Error(`Unknown service composition ${name}@${version}`);
    }
  }
  const versions = mapValues(modules, (module, version) => {
    if (!serviceSemVerPattern.test(version)) {
      throw new Error(`Invalid service composition version ${version}`);
    }
    const { models, contracts } = module;
    assertValidModels({ models, context: `makeService: ${name}@${version}` });
    for (const [modelName, model] of Object.entries(models)) {
      if (Model.isReplica(model)) {
        throw new Error(
          `Service ${name}@${version} model ${modelName} must be authoritative`,
        );
      }
    }
    for (const [contractName, contract] of Object.entries(contracts)) {
      if (contractName !== contract.commandName) {
        throw new Error(
          `Contract key ${contractName} must match ${contract.commandName}`,
        );
      }
      for (const model of Object.values(contract.models)) {
        if (models[model.modelName] !== model) {
          throw new Error(
            `Contract ${contractName} model ${model.modelName} must belong to service ${name}@${version}`,
          );
        }
      }
    }
    const actors = actorVersions[version] ?? {};
    for (const [actorName, actor] of Object.entries(actors)) {
      if (actorName !== actor.name) {
        throw new Error(`Actor key ${actorName} must match ${actor.name}`);
      }
      for (const [modelName, model] of Object.entries(actor.db.models)) {
        if (models[modelName] !== model) {
          throw new Error(
            `Actor ${actorName} database model ${modelName} must reference ${name}@${version}`,
          );
        }
      }
      for (const [modelName, selection] of Object.entries(actor.selections)) {
        if (models[modelName] !== selection.model) {
          throw new Error(
            `Actor ${actorName}.${modelName} must reference ${name}@${version}`,
          );
        }
      }
    }
    const queries = mapValues(
      queryVersions[version] ?? {},
      (query, queryKey) => ({
        ...query,
        kind: 'service' as const,
        name: String(queryKey),
        serviceName: name,
      }),
    );
    return Object.assign(new Service(), {
      actors,
      name,
      version,
      models,
      contracts,
      queries,
    });
  });
  return Object.assign(new VersionedService(), { name, versions });
}
