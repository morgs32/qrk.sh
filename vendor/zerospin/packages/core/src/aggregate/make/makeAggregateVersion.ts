import { Schema } from 'effect';
import '@zerospin/server-only';

import { AggregateActorVersionSchema } from '../../aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion.ts';
import { AutomationSchema } from '../../automation/makeAutomation.ts';
import type {
  IActorCommandGuards,
  IAnyAutomation,
} from '../../automation/types.ts';
import { Contract } from '../../contracts/make/makeContractVersion.ts';
import { OwnerGuardsSchema } from '../../contracts/ownerGuards.ts';
import type { IAnyContracts, IContract } from '../../contracts/types.ts';
import { assertValidModels } from '../../models/assertValidModels.ts';
import { Model } from '../../models/defineModel.ts';
import { assertSelectionQueryModels } from '../../models/makeSelection.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
} from '../../models/types.ts';
import { composeDeclarations } from '../../module/composeDeclarations.ts';
import type {
  IAnyDeclarationModule,
  IAssertDistinctDeclarations,
  IComposedDeclarations,
} from '../../module/types.ts';
import type { IAnyAuthoredAggregate, IAuthoredAggregate } from '../types.ts';

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);
const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IContract => input instanceof Contract,
);
const DeclarationModuleSchema = Schema.Struct({
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  contracts: Schema.Record(Schema.String, CanonicalContractSchema),
  automations: Schema.Record(Schema.String, AutomationSchema),
});

const AggregatePropsSchema = Schema.Struct({
  guards: Schema.optionalKey(Schema.Record(Schema.String, OwnerGuardsSchema)),
  version: Schema.String.check(
    Schema.makeFilter((version: string) => {
      const match =
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
          version,
        );
      if (match === null) {
        return `expected SemVer`;
      }
      const major = Number(match[1]);
      const minor = Number(match[2]);
      const patch = Number(match[3]);
      if (
        !Number.isSafeInteger(major) ||
        !Number.isSafeInteger(minor) ||
        !Number.isSafeInteger(patch)
      ) {
        return `expected SemVer`;
      }
      return true;
    }),
  ),
  modules: Schema.optionalKey(
    Schema.Record(Schema.String, DeclarationModuleSchema),
  ),
  models: Schema.optionalKey(DeclarationModuleSchema.fields.models),
  contracts: Schema.optionalKey(DeclarationModuleSchema.fields.contracts),
  automations: Schema.optionalKey(DeclarationModuleSchema.fields.automations),
  actors: Schema.Record(Schema.String, AggregateActorVersionSchema),
});
class Aggregate {}

export const AggregateSchema = Schema.declare(
  (input: unknown): input is IAnyAuthoredAggregate =>
    input instanceof Aggregate,
);

export function makeAggregateVersion<
  const NAME extends string,
  const MODELS extends IAnyModels = {},
  const CONTRACTS extends IAnyContracts = {},
  const AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = {},
  const ACTORS extends IAnyAuthoredAggregate['actors'] = {},
  const VERSION extends string = string,
  GUARD_REQUIREMENTS = never,
  const MODULES extends Readonly<Record<string, IAnyDeclarationModule>> = {},
>(
  identity: Readonly<{
    name: NAME;
  }>,
  props: {
    version: VERSION;
    modules?: MODULES &
      IAssertDistinctDeclarations<
        NoInfer<MODELS>,
        NoInfer<CONTRACTS>,
        NoInfer<AUTOMATIONS>,
        NoInfer<MODULES>
      > & {
        [K in keyof MODULES]: {
          models: IAssertValidModels<
            NoInfer<MODULES[K]['models']>,
            NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
          >;
        };
      };
    models?: MODELS &
      IAssertValidModels<
        NoInfer<MODELS>,
        NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>
      >;
    contracts?: CONTRACTS;
    automations?: AUTOMATIONS;
    // Guard callbacks consume the inferred models and actors; they do not define them.
    guards?: {
      readonly [K in keyof NoInfer<ACTORS>]?: IActorCommandGuards<
        NoInfer<ACTORS[K]['contracts']>,
        NoInfer<ACTORS[K]['automations']>,
        NoInfer<IComposedDeclarations<MODELS, MODULES, 'models'>>,
        NoInfer<ACTORS[K]['identity']['claimsSchema']['Type']>,
        NoInfer<ACTORS[K]['identity']['identitySchema']['Type']>,
        'aggregate',
        GUARD_REQUIREMENTS
      >;
    };
    actors: ACTORS & {
      [K in keyof ACTORS]: {
        name: K;
        selections: {
          [M in keyof ACTORS[K]['selections']]: {
            model: M extends keyof IComposedDeclarations<
              MODELS,
              MODULES,
              'models'
            >
              ? IComposedDeclarations<MODELS, MODULES, 'models'>[M]
              : never;
          };
        };
      };
    };
  },
): IAuthoredAggregate<
  NAME,
  IComposedDeclarations<MODELS, MODULES, 'models'>,
  ACTORS,
  VERSION,
  GUARD_REQUIREMENTS,
  IComposedDeclarations<CONTRACTS, MODULES, 'contracts'>,
  IComposedDeclarations<AUTOMATIONS, MODULES, 'automations'>
>;

export function makeAggregateVersion(
  identity: Readonly<{
    name: string;
  }>,
  props: unknown,
): unknown {
  const decodedProps = Schema.decodeUnknownSync(AggregatePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const decoded = {
    ...decodedProps,
    ...Schema.decodeUnknownSync(
      Schema.Struct({
        name: Schema.String,
      }),
      { onExcessProperty: 'error' },
    )(identity),
  };
  const { name, version, actors } = decoded;
  const { models, contracts, automations } = composeDeclarations(decoded);
  const services: Record<string, string> = {};
  for (const [modelName, model] of Object.entries(models)) {
    if (!Model.isReplica(model)) continue;
    const previous = services[model.serviceName];
    if (previous !== undefined && previous !== model.serviceVersion) {
      throw new Error(`Conflicting service versions for replica ${modelName}`);
    }
    services[model.serviceName] = model.serviceVersion;
  }
  assertValidModels({
    models,
    context: `makeAggregateVersion: ${name}`,
  });

  for (const [contractName, contract] of Object.entries(contracts)) {
    if (contractName !== contract.commandName) {
      throw new Error(
        `Contract key ${contractName} must match ${contract.commandName}`,
      );
    }
    for (const model of Object.values(contract.models)) {
      if (models[model.modelName] !== model) {
        throw new Error(
          `Contract ${contractName} model ${model.modelName} must belong to aggregate ${name}`,
        );
      }
    }
  }
  for (const [automationName, automation] of Object.entries(automations)) {
    if (automationName !== automation.name) {
      throw new Error(
        `Automation key ${automationName} must match ${automation.name}`,
      );
    }
    if (contracts[automation.on.commandName] !== automation.on) {
      throw new Error(
        `Automation ${automationName} trigger must reference its final contract`,
      );
    }
    for (const output of Object.values(automation.contracts)) {
      if (contracts[output.commandName] !== output) {
        throw new Error(
          `Automation ${automationName} output must reference its final contract`,
        );
      }
    }
  }

  for (const [actorName, actor] of Object.entries(actors)) {
    if (actorName !== actor.name) {
      throw new Error(
        `Actor key "${actorName}" must match actor name "${actor.name}"`,
      );
    }
    for (const [modelName, model] of Object.entries(actor.db.models)) {
      if (models[modelName] !== model) {
        throw new Error(
          `Actor ${actorName} database model ${modelName} must be the same object as models.${modelName}`,
        );
      }
    }
    for (const [modelName, filter] of Object.entries(actor.selections)) {
      if (filter.model !== models[modelName]) {
        throw new Error(
          `Actor ${actorName}.${modelName} must be the same object as models.${modelName}`,
        );
      }
      assertSelectionQueryModels({ selection: filter, models });
    }
    for (const [contractName, contract] of Object.entries(actor.contracts)) {
      if (contracts[contractName] !== contract) {
        throw new Error(
          `Actor ${actorName} contract ${contractName} must reference the aggregate declarations`,
        );
      }
    }
    for (const [automationName, automation] of Object.entries(
      actor.automations,
    )) {
      if (automations[automationName] !== automation) {
        throw new Error(
          `Actor ${actorName} automation ${automationName} must reference the aggregate declarations`,
        );
      }
    }
  }

  for (const [actorName, guards] of Object.entries(decoded.guards ?? {})) {
    const actor = actors[actorName];
    if (actor === undefined) {
      throw new Error(`Unknown guard actor ${actorName}`);
    }
    for (const command of Object.keys(guards)) {
      if (
        !(command in actor.contracts) &&
        !Object.values(actor.automations).some(
          automation => command in automation.contracts,
        )
      ) {
        throw new Error(
          `Unknown aggregate guard command ${actorName}.${command}`,
        );
      }
    }
  }
  const fields = {
    guards: decoded.guards ?? {},
    name,
    version,
    models,
    contracts,
    automations,
    services,
    actors,
  };
  const aggregate = Object.assign(
    new Aggregate(),
    fields,
  ) as IAnyAuthoredAggregate;
  return aggregate;
}

/** Build the next aggregate from complete authored declarations. */
export function upgradeAggregateVersion<
  const NAME extends string,
  const MODELS extends IAnyModels = {},
  const CONTRACTS extends IAnyContracts = {},
  const AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = {},
  const ACTORS extends IAnyAuthoredAggregate['actors'] = {},
  const VERSION extends string = string,
  GUARD_REQUIREMENTS = never,
  const MODULES extends Readonly<Record<string, IAnyDeclarationModule>> = {},
>(
  previous: Readonly<{ name: NAME }>,
  props: Parameters<
    typeof makeAggregateVersion<
      NAME,
      MODELS,
      CONTRACTS,
      AUTOMATIONS,
      ACTORS,
      VERSION,
      GUARD_REQUIREMENTS,
      MODULES
    >
  >[1],
): IAuthoredAggregate<
  NAME,
  IComposedDeclarations<MODELS, MODULES, 'models'>,
  ACTORS,
  VERSION,
  GUARD_REQUIREMENTS,
  IComposedDeclarations<CONTRACTS, MODULES, 'contracts'>,
  IComposedDeclarations<AUTOMATIONS, MODULES, 'automations'>
>;

export function upgradeAggregateVersion(
  previous: Readonly<{ name: string }>,
  props: unknown,
): unknown {
  return Reflect.apply(makeAggregateVersion, undefined, [
    { name: previous.name },
    props,
  ]);
}
