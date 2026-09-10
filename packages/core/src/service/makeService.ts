import '@zerospin/server-only';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Layer, Schema, type Effect } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';

import { Contract } from '../contracts/makeVersion.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type {
  IFrontendModelBindings,
  IServiceAuthorization,
  IServiceFrontendBinding,
  IServiceFrontendBindingProps,
} from '../frontendBinding/types.ts';
import { ServiceFrontendController } from '../frontendController/makeFrontendController.ts';
import type { IAnyServiceFrontendController } from '../frontendController/types.ts';
import { initializeGuards } from '../guards/initializeGuards.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import { Model } from '../models/makeModel.ts';
import type {
  IAnyModels,
  IAssertValidModels,
  IModel,
  IModelReplica,
  InferPayloadInput,
} from '../models/types.ts';
import { isSemVerOlder } from '../utils/isSemVerOlder.ts';

import { makeServiceCommand } from './makeServiceCommand.ts';
import type {
  IAnyService,
  IResolvedServiceQuery,
  IService,
  IServiceQuery,
} from './types.ts';

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
  (input: unknown): input is IAnyContracts[string] => input instanceof Contract,
);

const CanonicalServiceFrontendControllerSchema = Schema.declare(
  (input: unknown): input is IAnyServiceFrontendController =>
    input instanceof ServiceFrontendController,
);

const serviceSemVerPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const ServicePropsSchema = Schema.Struct({
  layer: Schema.optionalKey(
    Schema.declare(
      (input: unknown): input is Layer.Layer<never, IAnyError, unknown> =>
        Layer.isLayer(input),
    ),
  ),
  name: Schema.String,
  version: Schema.String.check(
    Schema.makeFilter((version: string) => {
      const match = serviceSemVerPattern.exec(version);
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
  historicalDefinitions: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        version: Schema.String,
        models: Schema.Record(Schema.String, Schema.String),
        contracts: Schema.Record(Schema.String, Schema.String),
      }),
    ),
  ),
  models: Schema.Record(Schema.String, CanonicalModelSchema),
  contracts: Schema.Record(Schema.String, CanonicalContractSchema),
  queries: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        paramsSchema: EffectSchemaSchema,
        query: FunctionSchema,
      }),
    ),
  ),
  frontends: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        controller: CanonicalServiceFrontendControllerSchema,
        models: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
        projectionAdapters: Schema.optionalKey(
          Schema.Record(Schema.String, FunctionSchema),
        ),
      }),
    ),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
});

type IServiceFrontendBindingInput = {
  controller: IAnyServiceFrontendController;
  models?: Record<string, string>;
  projectionAdapters?: Record<string, unknown>;
};

type IModelBindingsAt<
  BINDING,
  FRONTEND_MODELS extends IAnyModels,
  SOURCE_MODELS extends IAnyModels,
> = BINDING extends {
  models: infer MODEL_BINDINGS extends IFrontendModelBindings<
    FRONTEND_MODELS,
    SOURCE_MODELS
  >;
}
  ? MODEL_BINDINGS
  : undefined;

type IValidateServiceFrontends<
  SERVICE_NAME extends string,
  MODELS extends IAnyModels,
  BINDINGS extends Record<string, IServiceFrontendBindingInput>,
  CONTROLLERS extends Record<string, IAnyServiceFrontendController>,
> = {
  [FRONTEND_NAME in keyof BINDINGS &
    keyof CONTROLLERS &
    string]: BINDINGS[FRONTEND_NAME] &
    IServiceFrontendBindingProps<
      MODELS,
      CONTROLLERS[FRONTEND_NAME],
      IModelBindingsAt<
        BINDINGS[FRONTEND_NAME],
        CONTROLLERS[FRONTEND_NAME]['models'],
        MODELS
      >
    > & {
      controller: CONTROLLERS[FRONTEND_NAME] & {
        serviceName: SERVICE_NAME;
        name: FRONTEND_NAME;
      };
    };
};

type IResolvedServiceFrontends<
  MODELS extends IAnyModels,
  FRONTENDS extends Record<string, IServiceFrontendBindingInput>,
> = {
  [FRONTEND_NAME in keyof FRONTENDS &
    string]: FRONTENDS[FRONTEND_NAME] extends {
    controller: infer CONTROLLER extends IAnyServiceFrontendController;
  }
    ? IServiceFrontendBinding<
        FRONTEND_NAME,
        MODELS,
        CONTROLLER,
        IModelBindingsAt<FRONTENDS[FRONTEND_NAME], CONTROLLER['models'], MODELS>
      >
    : never;
};

type IResolvedServiceQueries<
  SERVICE_NAME extends string,
  MODELS extends IAnyModels,
  QUERIES extends Record<string, unknown>,
> = {
  [QUERY_NAME in keyof QUERIES &
    string]: QUERIES[QUERY_NAME] extends IServiceQuery<
    MODELS,
    infer PARAMS_SCHEMA,
    infer RESULT
  >
    ? IResolvedServiceQuery<
        SERVICE_NAME,
        QUERY_NAME,
        MODELS,
        PARAMS_SCHEMA,
        RESULT
      >
    : never;
};

class Service {}

export const ServiceSchema = Schema.declare(
  (input: unknown): input is IAnyService => input instanceof Service,
);

export function makeService<
  const NAME extends string,
  const MODELS extends IAnyModels,
  const CONTRACTS extends IAnyContracts,
  const VERSION extends string,
  const QUERIES extends Record<string, IServiceQuery<MODELS>> = {},
  const FRONTENDS extends Record<string, IServiceFrontendBindingInput> = {},
  AUTHORIZE extends IServiceAuthorization<
    IResolvedServiceFrontends<MODELS, FRONTENDS>,
    MODELS,
    never
  > = IServiceAuthorization<
    IResolvedServiceFrontends<MODELS, FRONTENDS>,
    MODELS,
    never
  >,
  LAYER_SERVICES = never,
  LAYER_REQUIREMENTS = never,
  const HISTORY extends readonly Readonly<{
    version: string;
    models: Readonly<Record<string, string>>;
    contracts: Readonly<Record<string, string>>;
  }>[] = readonly [],
>(
  props: {
    name: NAME;
    version: VERSION;
    historicalDefinitions?: HISTORY;
    models: MODELS &
      IAssertValidModels<MODELS> & {
        [MODEL_NAME in keyof MODELS]: MODELS[MODEL_NAME] extends IModelReplica
          ? ITypeError<`Service "${NAME}" must register the authoritative source model, not replica "${MODELS[MODEL_NAME]['modelName']}"`>
          : MODELS[MODEL_NAME];
      };
    contracts: CONTRACTS;
    queries?: QUERIES;
    frontends?: FRONTENDS &
      IValidateServiceFrontends<
        NAME,
        MODELS,
        NoInfer<FRONTENDS>,
        {
          [FRONTEND_NAME in keyof NoInfer<FRONTENDS> &
            string]: NoInfer<FRONTENDS>[FRONTEND_NAME]['controller'];
        }
      >;
    layer?: Layer.Layer<LAYER_SERVICES, IAnyError, LAYER_REQUIREMENTS>;
  } & ([keyof FRONTENDS] extends [never]
    ? {
        authorize?: never;
      }
    : {
        authorize: AUTHORIZE;
      }),
): IService<
  NAME,
  MODELS,
  CONTRACTS,
  IResolvedServiceQueries<NAME, MODELS, QUERIES>,
  IResolvedServiceFrontends<MODELS, FRONTENDS>,
  AUTHORIZE,
  VERSION,
  LAYER_SERVICES,
  LAYER_REQUIREMENTS,
  HISTORY[number] extends never
    ? Effect.Services<
        ReturnType<NonNullable<CONTRACTS[keyof CONTRACTS]['guard']>>
      >
    : Effect.Services<
        ReturnType<
          NonNullable<
            ReturnType<CONTRACTS[keyof CONTRACTS]['getVersion']>['guard']
          >
        >
      >
>;

export function makeService(props: unknown): unknown {
  const decoded = Schema.decodeUnknownSync(ServicePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const {
    name,
    version,
    historicalDefinitions: authoredHistoricalDefinitions = [],
    models,
    contracts,
    queries: queryInputs = {},
    frontends: frontendInputs = {},
    authorize,
  } = decoded;

  const hasFrontends = Object.keys(frontendInputs).length > 0;
  Schema.decodeUnknownSync(
    Schema.Struct({
      authorize: Schema.Union([FunctionSchema, Schema.Undefined]),
    }).check(
      Schema.makeFilter(decodedAuthorization => {
        if (!hasFrontends && decodedAuthorization.authorize !== undefined) {
          return `must omit authorize when it has no frontends`;
        }
        if (
          hasFrontends &&
          typeof decodedAuthorization.authorize !== 'function'
        ) {
          return `authorize must be a function when the service has frontends`;
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )({ authorize });

  assertValidModels({
    models,
    context: `makeService: ${name}`,
  });

  Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({
        version: Schema.String,
        models: Schema.Record(Schema.String, Schema.String),
        contracts: Schema.Record(Schema.String, Schema.String),
      }),
    ).check(
      Schema.makeFilter(definitions => {
        const historicalVersions = new Set<string>();
        for (const historicalDefinition of definitions) {
          if (historicalDefinition.version === version) {
            return `Historical service version "${historicalDefinition.version}" duplicates the current version for "${name}"`;
          }
          if (historicalVersions.has(historicalDefinition.version)) {
            return `Duplicate historical service version "${historicalDefinition.version}" for "${name}"`;
          }
          historicalVersions.add(historicalDefinition.version);
          if (!isSemVerOlder(historicalDefinition.version, version)) {
            return `Historical service version "${historicalDefinition.version}" for "${name}" must be older than current version "${version}"`;
          }
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(authoredHistoricalDefinitions);
  const historicalDefinitions = authoredHistoricalDefinitions.map(
    definition => ({
      version: definition.version,
      models: { ...definition.models },
      contracts: { ...definition.contracts },
    }),
  );

  Schema.decodeUnknownSync(
    Schema.Record(Schema.String, CanonicalModelSchema).check(
      Schema.makeFilter((decodedModels: Record<string, IModel>) => {
        for (const [modelKey, model] of Object.entries(decodedModels)) {
          if (Model.isReplica(model)) {
            return {
              path: [modelKey],
              issue: `must be the authoritative source model, not a replica`,
            };
          }
        }
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(models);

  const queries = mapValues(queryInputs, (query, queryKey) => ({
    ...query,
    kind: 'service',
    name: String(queryKey),
    serviceName: name,
  }));

  const frontends = mapValues(frontendInputs, (binding, frontendKey) => {
    const frontendName = String(frontendKey);
    const {
      controller,
      models: authoredModelBindings,
      projectionAdapters = {},
    } = binding;

    Schema.decodeUnknownSync(
      Schema.Struct({
        kind: Schema.Literal('service'),
        serviceName: Schema.Literal(name),
        name: Schema.Literal(frontendName),
      }),
      { onExcessProperty: 'ignore' },
    )(controller);

    const resolvedModelBindings: Record<string, string> = {};
    if (authoredModelBindings === undefined) {
      for (const modelKey of Object.keys(controller.models)) {
        if (models[modelKey] !== undefined) {
          resolvedModelBindings[modelKey] = modelKey;
        }
      }
    } else {
      Object.assign(resolvedModelBindings, authoredModelBindings);
    }

    const bindingModels: Record<string, IModel> = {};
    const usedSourceModelKeys = new Set<string>();
    Schema.decodeUnknownSync(
      Schema.Record(Schema.String, Schema.String).check(
        Schema.makeFilter((decodedBindings: Record<string, string>) => {
          for (const [frontendModelKey, sourceModelKey] of Object.entries(
            decodedBindings,
          )) {
            if (controller.models[frontendModelKey] === undefined) {
              return {
                path: [frontendModelKey],
                issue: `is not a frontend model`,
              };
            }
            if (models[sourceModelKey] === undefined) {
              return {
                path: [frontendModelKey],
                issue: `references missing service model "${sourceModelKey}"`,
              };
            }
            if (usedSourceModelKeys.has(sourceModelKey)) {
              return `must not bind service model "${sourceModelKey}" more than once`;
            }
            usedSourceModelKeys.add(sourceModelKey);
          }
          return true;
        }),
      ),
      { onExcessProperty: 'error' },
    )(resolvedModelBindings);

    for (const [frontendModelKey, sourceModelKey] of Object.entries(
      resolvedModelBindings,
    )) {
      const sourceModel = models[sourceModelKey];
      if (sourceModel !== undefined) {
        bindingModels[frontendModelKey] = sourceModel;
      }
    }

    Schema.decodeUnknownSync(
      Schema.Record(Schema.String, CanonicalModelSchema).check(
        Schema.makeFilter((decodedBindingModels: Record<string, IModel>) => {
          for (const [frontendModelKey, sourceModel] of Object.entries(
            decodedBindingModels,
          )) {
            const frontendModel = controller.models[frontendModelKey];
            if (frontendModel === undefined) {
              continue;
            }
            const diverges = sourceModel.modelName !== frontendModel.modelName;
            const hasAdapter = frontendModelKey in projectionAdapters;
            if (!diverges && !isEqual(sourceModel.spec, frontendModel.spec)) {
              return {
                path: [frontendModelKey],
                issue: `must exactly match service model "${sourceModel.modelName}" when no projection adapter is allowed`,
              };
            }
            if (diverges && !hasAdapter) {
              return `projectionAdapters.${frontendModelKey} is required when source modelName "${sourceModel.modelName}" differs from frontend modelName "${frontendModel.modelName}"`;
            }
            if (!diverges && hasAdapter) {
              return `projectionAdapters.${frontendModelKey} must not be set when source and frontend modelName both equal "${frontendModel.modelName}"`;
            }
          }
          for (const adapterKey of Object.keys(projectionAdapters)) {
            if (decodedBindingModels[adapterKey] === undefined) {
              return `projectionAdapters.${adapterKey} has no matching binding model`;
            }
          }
          return true;
        }),
      ),
      { onExcessProperty: 'error' },
    )(bindingModels);

    return {
      name: frontendName,
      controller,
      models: bindingModels,
      projectionAdapters,
    };
  });

  const makeCommand = <
    CONTRACT_NAME extends keyof typeof contracts & string,
  >(commandProps: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<(typeof contracts)[CONTRACT_NAME]['payload']>;
  }) =>
    makeServiceCommand({
      contracts,
      serviceName: name,
      serviceVersion: version,
      ...commandProps,
    });

  const slicesByVersion = new Map<string, IAnyService>();
  let resolvedService: IAnyService;
  const isVersionAvailableOnSlice = (
    requestedVersion: string,
    sliceVersion: string,
  ): boolean => {
    if (requestedVersion === sliceVersion) {
      return true;
    }
    if (requestedVersion === version) {
      return false;
    }
    if (
      !historicalDefinitions.some(
        definition => definition.version === requestedVersion,
      )
    ) {
      return false;
    }
    return isSemVerOlder(requestedVersion, sliceVersion);
  };
  const getVersion = (
    requestedVersion: string,
    sliceVersion = version,
  ): IAnyService => {
    if (!isVersionAvailableOnSlice(requestedVersion, sliceVersion)) {
      throw new ZerospinError({
        code: 'service-snapshot-version-unsupported',
        message: `Service "${name}" does not support snapshot version "${requestedVersion}"`,
        extra: {
          serviceName: name,
          currentVersion: sliceVersion,
          requestedVersion,
        },
      });
    }
    if (requestedVersion === version) {
      return resolvedService;
    }
    const cached = slicesByVersion.get(requestedVersion);
    if (cached !== undefined) {
      return cached;
    }
    const snapshot = historicalDefinitions.find(
      definition => definition.version === requestedVersion,
    );
    if (snapshot === undefined) {
      throw new ZerospinError({
        code: 'service-snapshot-version-unsupported',
        message: `Service "${name}" does not support snapshot version "${requestedVersion}"`,
        extra: {
          serviceName: name,
          currentVersion: sliceVersion,
          requestedVersion,
        },
      });
    }
    const slicedModels: Record<string, (typeof models)[string]> = {};
    for (const [modelKey, modelVersion] of Object.entries(snapshot.models)) {
      const currentModel = models[modelKey];
      if (currentModel === undefined) {
        throw new ZerospinError({
          code: 'service-snapshot-version-unsupported',
          message: `Service "${name}" snapshot "${requestedVersion}" references missing model "${modelKey}"`,
          extra: {
            serviceName: name,
            requestedVersion,
            modelKey,
          },
        });
      }
      slicedModels[modelKey] = currentModel.getVersion(modelVersion);
    }
    const slicedContracts: Record<string, (typeof contracts)[string]> = {};
    for (const [contractKey, contractVersion] of Object.entries(
      snapshot.contracts,
    )) {
      const currentContract = contracts[contractKey];
      if (currentContract === undefined) {
        throw new ZerospinError({
          code: 'service-snapshot-version-unsupported',
          message: `Service "${name}" snapshot "${requestedVersion}" references missing contract "${contractKey}"`,
          extra: {
            serviceName: name,
            requestedVersion,
            contractKey,
          },
        });
      }
      slicedContracts[contractKey] =
        currentContract.getVersion(contractVersion);
    }
    const olderHistoricalDefinitions = historicalDefinitions.filter(
      definition =>
        definition.version !== requestedVersion &&
        isSemVerOlder(definition.version, requestedVersion),
    );
    const sliceFields = {
      initializeGuards: initializeGuards({
        layer: decoded.layer ?? Layer.empty,
        guards: Object.fromEntries(
          Object.entries(slicedContracts).map(([name, contract]) => [
            name,
            contract.guard === undefined ? [] : [contract.guard],
          ]),
        ),
      }),
      layer: decoded.layer ?? Layer.empty,
      name,
      version: requestedVersion,
      historicalDefinitions: olderHistoricalDefinitions,
      models: slicedModels,
      contracts: slicedContracts,
      queries,
      frontends,
      makeCommand: <
        CONTRACT_NAME extends keyof typeof slicedContracts & string,
      >(commandProps: {
        contractName: CONTRACT_NAME;
        payload: InferPayloadInput<
          (typeof slicedContracts)[CONTRACT_NAME]['payload']
        >;
      }) =>
        makeServiceCommand({
          contracts: slicedContracts,
          serviceName: name,
          serviceVersion: requestedVersion,
          ...commandProps,
        }),
      getVersion: (nestedVersion: string) =>
        getVersion(nestedVersion, requestedVersion),
    };
    const slice = Object.assign(
      new Service(),
      hasFrontends ? { ...sliceFields, authorize } : sliceFields,
    ) as IAnyService;
    slicesByVersion.set(requestedVersion, slice);
    return slice;
  };

  const resolvedFields = {
    initializeGuards: initializeGuards({
      layer: decoded.layer ?? Layer.empty,
      guards: Object.fromEntries(
        Object.entries(contracts).map(([name, contract]) => [
          name,
          contract.guard === undefined ? [] : [contract.guard],
        ]),
      ),
    }),
    layer: decoded.layer ?? Layer.empty,
    name,
    version,
    historicalDefinitions,
    models,
    contracts,
    queries,
    frontends,
    makeCommand,
    getVersion: (requestedVersion: string) => getVersion(requestedVersion),
  };
  resolvedService = Object.assign(
    new Service(),
    hasFrontends ? { ...resolvedFields, authorize } : resolvedFields,
  ) as IAnyService;
  slicesByVersion.set(version, resolvedService);
  return resolvedService;
}
