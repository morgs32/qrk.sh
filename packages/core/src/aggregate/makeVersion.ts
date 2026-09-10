import '@zerospin/server-only';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';

import type { AssertContractMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import { Contract } from '../contracts/makeVersion.ts';
import type {
  IAnyContractBindings,
  IContract,
  IContractBinding,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { initializeGuards } from '../guards/initializeGuards.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/makeModel.ts';
import type {
  IAggregateId,
  IAnyModels,
  IAssertValidModels,
  IModel,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import { ServiceSchema } from '../service/makeService.ts';
import type { IAnyService } from '../service/types.ts';
import { getByKeyOrThrow } from '../utils/getByKeyOrThrow.ts';

import { makeAggregateCommand } from './makeAggregateCommand.ts';
import type {
  IAggregateAuthorization,
  IAnyAuthoredAggregate,
  IAuthoredAggregate,
} from './types.ts';

const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);

const CanonicalModelSchema = Schema.declare(
  (input: unknown): input is IModel => input instanceof Model,
);

const CanonicalContractSchema = Schema.declare(
  (input: unknown): input is IContract => input instanceof Contract,
);

const ContractBindingSchema = Schema.Struct({
  contract: CanonicalContractSchema,
  guard: Schema.optionalKey(
    Schema.declare(
      (value): value is NonNullable<IContractBinding['guard']> =>
        typeof value === 'function',
    ),
  ),
});

const AggregatePropsSchema = Schema.Struct({
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
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  services: Schema.optionalKey(Schema.Record(Schema.String, ServiceSchema)),
  contracts: Schema.Record(Schema.String, ContractBindingSchema),
  selections: Schema.Record(
    Schema.String,
    Schema.Struct({
      model: CanonicalModelSchema,
      where: FunctionSchema,
    }),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
});

const authoredInputs = new WeakMap<
  IAnyAuthoredAggregate,
  typeof AggregatePropsSchema.Type &
    Readonly<{
      name: string;
      layer: Layer.Layer<never, IAnyError, unknown>;
    }>
>();

class Aggregate {}

export const AggregateSchema = Schema.declare(
  (input: unknown): input is IAnyAuthoredAggregate =>
    input instanceof Aggregate,
);

export function makeVersion<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContractBindings,
  const SELECTIONS extends IAnyAuthoredAggregate['selections'] = {},
  AUTHORIZE extends IAggregateAuthorization<MODELS> =
    IAggregateAuthorization<MODELS>,
  const VERSION extends string = string,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = never,
>(
  identity: Readonly<{
    name: NAME;
    layer: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  }>,
  props: {
    version: VERSION;
    models: MODELS & IAssertValidModels<MODELS>;
    services?: Readonly<Record<string, IAnyService>>;
    contracts: CONTRACTS & {
      [K in keyof CONTRACTS &
        string]: K extends CONTRACTS[K]['contract']['commandName']
        ? CONTRACTS[K] & {
            contract: AssertContractMutationsInModels<
              CONTRACTS[K]['contract'],
              NoInfer<MODELS>
            >;
            guard?: (props: {
              userId: string | null;
              db: Readonly<
                Pick<
                  IDb<IResourceDbConfig<NoInfer<MODELS>, Record<never, never>>>,
                  'query'
                >
              >;
              payload: InferCommandPayload<CONTRACTS[K]['contract']['payload']>;
            }) => Effect.Effect<void, IAnyError, unknown>;
          }
        : ITypeError<`Bad contract "${K}". The key in contracts should be the commandName`>;
    };
    selections: SELECTIONS;
    authorize?: AUTHORIZE;
  },
): IAuthoredAggregate<
  NAME,
  MODELS,
  CONTRACTS,
  SELECTIONS,
  AUTHORIZE,
  VERSION,
  LAYER_SERVICES,
  LAYER_REQUIREMENTS
>;

export function makeVersion(
  identity: Readonly<{
    name: string;
    layer: Layer.Layer<never, IAnyError, unknown>;
  }>,
  props: unknown,
): unknown {
  const decoded = {
    ...Schema.decodeUnknownSync(AggregatePropsSchema, {
      onExcessProperty: 'error',
    })(props),
    ...Schema.decodeUnknownSync(
      Schema.Struct({
        name: Schema.String,
        layer: Schema.declare(
          (input: unknown): input is Layer.Layer<never, IAnyError, unknown> =>
            Layer.isLayer(input),
        ),
      }),
      { onExcessProperty: 'error' },
    )(identity),
  };
  const {
    name,
    version,
    models,
    services: serviceDefinitions = {},
    contracts: decodedContractBindings,
    selections,
    authorize,
  } = decoded;
  const services = Object.fromEntries(
    Object.entries(serviceDefinitions).map(([serviceName, service]) => {
      if (serviceName !== service.name) {
        throw new Error(
          `Aggregate "${name}" service key "${serviceName}" must match service name "${service.name}"`,
        );
      }
      return [serviceName, service.version];
    }),
  );
  const contracts = Object.fromEntries(
    Object.entries(decodedContractBindings).map(([commandName, binding]) => [
      commandName,
      { ...binding },
    ]),
  );

  assertValidModels({
    models,
    context: `aggregates.makeVersion: ${name}`,
  });

  Schema.decodeUnknownSync(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        model: CanonicalModelSchema,
        where: FunctionSchema,
      }),
    ).check(
      Schema.makeFilter(
        (decodedSelections: Record<string, { model: IModel }>) => {
          if (
            Object.keys(decodedSelections).length !== Object.keys(models).length
          ) {
            return `must contain exactly one selection for every model`;
          }
          for (const [modelKey, selection] of Object.entries(
            decodedSelections,
          )) {
            if (selection.model !== models[modelKey]) {
              return {
                path: [modelKey, 'model'],
                issue: `must be the same object as models.${modelKey}`,
              };
            }
          }
          return true;
        },
      ),
    ),
    { onExcessProperty: 'error' },
  )(selections);

  const makeCommand = <
    CONTRACT_NAME extends keyof typeof contracts & string,
    const SYSTEM_NAME extends string,
  >(commandProps: {
    contractName: CONTRACT_NAME;
    aggregateId: IAggregateId;
    systemName: SYSTEM_NAME;
    payload: InferPayloadInput<
      (typeof contracts)[CONTRACT_NAME]['contract']['payload']
    >;
  }) => {
    return Effect.gen(function* () {
      const { contractName, ...aggregateCommandProps } = commandProps;
      const contractBinding = yield* getByKeyOrThrow({
        record: contracts,
        key: contractName,
        recordKind: `aggregates.makeVersion: ${name}.contracts`,
      });
      return yield* makeAggregateCommand({
        contract: contractBinding.contract,
        aggregateName: name,
        aggregateVersion: version,
        ...aggregateCommandProps,
      });
    });
  };

  const getVersion = Effect.fn(`getVersion/${name}`)(function* (
    requestedVersion: string,
  ) {
    if (requestedVersion !== version) {
      return yield* new ZerospinError({
        code: 'aggregate-version-unsupported',
        message: `Aggregate "${name}" is version "${version}", not "${requestedVersion}"`,
        extra: {
          aggregateName: name,
          aggregateVersion: version,
          currentVersion: version,
          requestedVersion,
        },
      });
    }
    return aggregate;
  });

  const fields = {
    initializeGuards: initializeGuards({
      layer: decoded.layer,
      guards: Object.fromEntries(
        Object.entries(contracts).map(([name, binding]) => [
          name,
          [binding.guard, binding.contract.guard].filter(
            guard => guard !== undefined,
          ),
        ]),
      ),
    }),
    layer: decoded.layer,
    name,
    version,
    models,
    services,
    contracts,
    selections,
    makeCommand,
    getVersion,
  };
  const aggregate = Object.assign(
    new Aggregate(),
    authorize === undefined ? fields : { ...fields, authorize },
  ) as IAnyAuthoredAggregate;
  authoredInputs.set(aggregate, decoded);
  return aggregate;
}

export function upgradeVersion<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContractBindings,
  const SELECTIONS extends IAnyAuthoredAggregate['selections'],
  AUTHORIZE extends IAggregateAuthorization<MODELS>,
  const VERSION extends string,
  const NEXT_VERSION extends string,
  LAYER_SERVICES,
  LAYER_REQUIREMENTS,
  const MODELS_PATCH extends Record<string, IModel | null> = {},
  const CONTRACTS_PATCH extends Record<
    string,
    IAnyContractBindings[string] | null
  > = {},
  const SELECTIONS_PATCH extends Record<
    string,
    IAnyAuthoredAggregate['selections'][string] | null
  > = {},
  NEXT_MODELS extends Record<string, IModel> = {
    readonly [K in
      | keyof MODELS
      | keyof MODELS_PATCH as K extends keyof MODELS_PATCH
      ? MODELS_PATCH[K] extends null
        ? never
        : K
      : K]: K extends keyof MODELS_PATCH
      ? Exclude<MODELS_PATCH[K], null>
      : K extends keyof MODELS
        ? MODELS[K]
        : never;
  },
  NEXT_CONTRACTS extends Record<string, IAnyContractBindings[string]> = {
    readonly [K in
      | keyof CONTRACTS
      | keyof CONTRACTS_PATCH as K extends keyof CONTRACTS_PATCH
      ? CONTRACTS_PATCH[K] extends null
        ? never
        : K
      : K]: K extends keyof CONTRACTS_PATCH
      ? Exclude<CONTRACTS_PATCH[K], null>
      : K extends keyof CONTRACTS
        ? CONTRACTS[K]
        : never;
  },
  NEXT_SELECTIONS extends Record<
    string,
    IAnyAuthoredAggregate['selections'][string]
  > = {
    readonly [K in
      | keyof SELECTIONS
      | keyof SELECTIONS_PATCH as K extends keyof SELECTIONS_PATCH
      ? SELECTIONS_PATCH[K] extends null
        ? never
        : K
      : K]: K extends keyof SELECTIONS_PATCH
      ? Exclude<SELECTIONS_PATCH[K], null>
      : K extends keyof SELECTIONS
        ? SELECTIONS[K]
        : never;
  },
  NEXT_PROPS extends Parameters<
    typeof makeVersion<
      NAME,
      NEXT_MODELS,
      NEXT_CONTRACTS,
      NEXT_SELECTIONS,
      IAggregateAuthorization<NEXT_MODELS>,
      NEXT_VERSION,
      LAYER_SERVICES,
      LAYER_REQUIREMENTS
    >
  >[1] = Parameters<
    typeof makeVersion<
      NAME,
      NEXT_MODELS,
      NEXT_CONTRACTS,
      NEXT_SELECTIONS,
      IAggregateAuthorization<NEXT_MODELS>,
      NEXT_VERSION,
      LAYER_SERVICES,
      LAYER_REQUIREMENTS
    >
  >[1],
>(
  previous: IAuthoredAggregate<
    NAME,
    MODELS,
    CONTRACTS,
    SELECTIONS,
    AUTHORIZE,
    VERSION,
    LAYER_SERVICES,
    LAYER_REQUIREMENTS
  >,
  props: {
    version: NEXT_VERSION;
    services?: Readonly<Record<string, IAnyService | null>>;
    authorize?: NEXT_PROPS['authorize'] | null;
    models?: MODELS_PATCH & {
      [K in keyof MODELS_PATCH]: MODELS_PATCH[K] extends null
        ? K extends keyof MODELS
          ? null
          : never
        : K extends keyof NonNullable<NEXT_PROPS['models']>
          ? NonNullable<NEXT_PROPS['models']>[K]
          : never;
    };
    contracts?: CONTRACTS_PATCH & {
      [K in keyof CONTRACTS_PATCH]: CONTRACTS_PATCH[K] extends null
        ? K extends keyof CONTRACTS
          ? null
          : never
        : K extends keyof NonNullable<NEXT_PROPS['contracts']>
          ? NonNullable<NEXT_PROPS['contracts']>[K]
          : never;
    };
    selections?: SELECTIONS_PATCH & {
      [K in keyof SELECTIONS_PATCH]: SELECTIONS_PATCH[K] extends null
        ? K extends keyof SELECTIONS
          ? null
          : never
        : K extends keyof NonNullable<NEXT_PROPS['selections']>
          ? NonNullable<NEXT_PROPS['selections']>[K]
          : never;
    };
  } & Omit<
    NEXT_PROPS,
    'version' | 'models' | 'services' | 'contracts' | 'selections' | 'authorize'
  >,
): ReturnType<
  typeof makeVersion<
    NAME,
    NEXT_MODELS,
    NEXT_CONTRACTS,
    NEXT_SELECTIONS,
    IAggregateAuthorization<NEXT_MODELS>,
    NEXT_VERSION,
    LAYER_SERVICES,
    LAYER_REQUIREMENTS
  >
>;

export function upgradeVersion(
  previous: unknown,
  upgradeProps: {
    version: string;
    models?: Record<string, unknown>;
    contracts?: Record<string, unknown>;
    selections?: Record<string, unknown>;
    services?: Record<string, IAnyService | null>;
    authorize?: unknown;
  },
): unknown {
  const decoded = authoredInputs.get(
    Schema.decodeUnknownSync(AggregateSchema)(previous),
  );
  if (decoded === undefined) {
    throw new Error(
      'Cannot upgrade an aggregate not constructed by aggregates.makeVersion',
    );
  }
  if (Object.hasOwn(upgradeProps, 'layer')) {
    throw new Error(
      'Aggregate layers are declared on makeAggregate, not upgrades',
    );
  }
  const { name } = decoded;
  const next = {
    ...decoded,
    version: upgradeProps.version,
  };
  for (const field of ['models', 'contracts', 'selections', 'services']) {
    const patch: unknown = Reflect.get(upgradeProps, field);
    if (patch === undefined) continue;
    const entries = Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Unknown),
    )(patch);
    const previous = Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.Unknown),
    )(Reflect.get(decoded, field) ?? {});
    const merged = { ...previous };
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) {
        if (!Object.hasOwn(previous, key)) {
          throw new Error(
            `Cannot remove unknown ${field} entry "${key}" from ${name}`,
          );
        }
        delete merged[key];
      } else {
        merged[key] = value;
      }
    }
    Reflect.set(next, field, merged);
  }
  if (Object.hasOwn(upgradeProps, 'authorize')) {
    if (upgradeProps.authorize === null) {
      Reflect.deleteProperty(next, 'authorize');
    } else {
      Reflect.set(next, 'authorize', upgradeProps.authorize);
    }
  }
  const { name: nextName, layer, ...nextProps } = next;
  return Reflect.apply(makeVersion, undefined, [
    { name: nextName, layer },
    nextProps,
  ]);
}
