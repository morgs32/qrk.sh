import type { IAuthenticationSignature } from '@zerospin/core/authentication/types';
import { makeContract } from '@zerospin/core/contracts/makeContract';
import type { IContract, IContracts } from '@zerospin/core/contracts/types';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import type {
  IAggregateFrontendController,
  IFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeReplica } from '@zerospin/core/models/makeReplica';
import type {
  IModel,
  IModelReplica,
  IModels,
} from '@zerospin/core/models/types';
import { PrimitiveKind, type IAnyShape } from '@zerospin/schema';
import { Effect, type Schema } from 'effect';

export type ISupportedDefinitionVersion<DEFINITION> = DEFINITION extends {
  version: infer CURRENT_VERSION extends string;
  historicalDefinitions: readonly (infer HISTORICAL_DEFINITION)[];
}
  ?
      | CURRENT_VERSION
      | (HISTORICAL_DEFINITION extends { version: infer VERSION extends string }
          ? VERSION
          : never)
  : never;

export type IRequestedDefinitionVersion<
  OVERRIDES,
  KEY,
  CURRENT_VERSION extends string,
> =
  OVERRIDES extends Readonly<Record<string, string>>
    ? KEY extends keyof OVERRIDES
      ? OVERRIDES[KEY] extends string
        ? OVERRIDES[KEY]
        : CURRENT_VERSION
      : CURRENT_VERSION
    : CURRENT_VERSION;

export type IContractAtVersion<
  CONTRACT extends IContract,
  VERSION extends string,
> = VERSION extends CONTRACT['version']
  ? CONTRACT
  : Extract<
        CONTRACT['historicalDefinitions'][number],
        { readonly version: VERSION }
      > extends {
        commandName: string;
        payload: infer PAYLOAD extends IAnyShape;
      }
    ? IContract<
        CONTRACT['commandName'],
        PAYLOAD,
        VERSION,
        CONTRACT['mutations'],
        readonly []
      >
    : never;

export type IModelAtVersion<
  MODEL extends IModel,
  VERSION extends string,
> = VERSION extends MODEL['version']
  ? MODEL
  : Extract<
        MODEL['historicalDefinitions'][number],
        { readonly version: VERSION }
      > extends infer DEFINITION extends {
        attributes: IModel['attributes'];
        propertiesShape: IModel['propertiesShape'];
      }
    ? MODEL extends IModelReplica<infer SOURCE_MODEL, infer SERVICE_NAME>
      ? Extract<
          SOURCE_MODEL['historicalDefinitions'][number],
          { readonly version: VERSION }
        > extends infer SOURCE_DEFINITION extends {
          attributes: IModel['attributes'];
          propertiesShape: IModel['propertiesShape'];
        }
        ? IModelReplica<
            IModel<
              SOURCE_DEFINITION['attributes'],
              SOURCE_MODEL['abbreviation'],
              SOURCE_MODEL['modelName'],
              VERSION,
              readonly [],
              SOURCE_DEFINITION['propertiesShape']
            >,
            SERVICE_NAME
          >
        : never
      : IModel<
          DEFINITION['attributes'],
          MODEL['abbreviation'],
          MODEL['modelName'],
          VERSION,
          readonly [],
          DEFINITION['propertiesShape']
        >
    : never;

export type ISignatureAtVersion<
  SIGNATURE extends IAuthenticationSignature,
  VERSION extends string,
> = VERSION extends SIGNATURE['version']
  ? SIGNATURE
  : Extract<
        SIGNATURE['historicalDefinitions'][number],
        { readonly version: VERSION }
      > extends infer DEFINITION extends {
        schema: Schema.Codec<unknown, unknown>;
      }
    ? IAuthenticationSignature<VERSION, DEFINITION['schema'], readonly []>
    : never;

export type IFrontendSourceSelection<
  FRONTEND extends IFrontendController = IFrontendController,
> = Readonly<{
  controller: FRONTEND;
  contracts?: Partial<{
    [KEY in keyof FRONTEND['contracts']]: ISupportedDefinitionVersion<
      FRONTEND['contracts'][KEY]
    >;
  }>;
  models?: Partial<{
    [KEY in keyof FRONTEND['models']]: ISupportedDefinitionVersion<
      FRONTEND['models'][KEY]
    >;
  }>;
}>;

export type ISourceSelectedFrontendController<
  ENTRY extends IFrontendSourceSelection,
> = ENTRY['controller'] extends infer FRONTEND extends IFrontendController
  ? FRONTEND extends IAggregateFrontendController
    ? IAggregateFrontendController<
        FRONTEND['systemName'],
        FRONTEND['aggregateName'],
        FRONTEND['frontendName'],
        {
          [KEY in keyof FRONTEND['contracts']]: IContractAtVersion<
            FRONTEND['contracts'][KEY],
            IRequestedDefinitionVersion<
              ENTRY['contracts'],
              KEY,
              FRONTEND['contracts'][KEY]['version']
            >
          >;
        },
        {
          [KEY in keyof FRONTEND['models']]: IModelAtVersion<
            FRONTEND['models'][KEY],
            IRequestedDefinitionVersion<
              ENTRY['models'],
              KEY,
              FRONTEND['models'][KEY]['version']
            >
          >;
        },
        FRONTEND['guards']
      >
    : FRONTEND extends IServiceFrontendController
      ? IServiceFrontendController<
          FRONTEND['systemName'],
          FRONTEND['serviceName'],
          FRONTEND['frontendName'],
          {
            [KEY in keyof FRONTEND['models']]: IModelAtVersion<
              FRONTEND['models'][KEY],
              IRequestedDefinitionVersion<
                ENTRY['models'],
                KEY,
                FRONTEND['models'][KEY]['version']
              >
            >;
          }
        >
      : never
  : never;

export function resolveFrontendSourceSelection(props: {
  entry: IFrontendSourceSelection;
  configuredFrontendName: string;
  systemName: string;
}): IFrontendController {
  const { controller } = props.entry;
  if (controller.systemName !== props.systemName) {
    throw new Error(
      `makeZerospinApp frontend "${props.configuredFrontendName}" belongs to system "${controller.systemName}", not "${props.systemName}".`,
    );
  }
  if (controller.frontendName !== props.configuredFrontendName) {
    throw new Error(
      `makeZerospinApp frontends key "${props.configuredFrontendName}" must equal frontendName "${controller.frontendName}".`,
    );
  }

  for (const contractKey of Object.keys(props.entry.contracts ?? {})) {
    if (!(contractKey in controller.contracts)) {
      throw new Error(
        `makeZerospinApp: unknown contract selection "${contractKey}" for frontend "${controller.frontendName}"`,
      );
    }
  }
  for (const modelKey of Object.keys(props.entry.models ?? {})) {
    if (!(modelKey in controller.models)) {
      throw new Error(
        `makeZerospinApp: unknown model selection "${modelKey}" for frontend "${controller.frontendName}"`,
      );
    }
  }

  const selectedModels: IModels =
    props.entry.models === undefined ? controller.models : {};
  const resolvingModelKeys = new Set<string>();
  const resolveModel = (modelKey: string): IModel => {
    const existing = selectedModels[modelKey];
    if (existing !== undefined) return existing;
    if (resolvingModelKeys.has(modelKey)) {
      throw new Error(
        `makeZerospinApp: selected frontend models contain a circular table reference at "${modelKey}"`,
      );
    }
    const model = controller.models[modelKey];
    if (model === undefined) {
      throw new Error(
        `makeZerospinApp: selected frontend model "${modelKey}" is unavailable`,
      );
    }
    resolvingModelKeys.add(modelKey);
    const requestedVersion = props.entry.models?.[modelKey] ?? model.version;
    if (requestedVersion === model.version) {
      selectedModels[modelKey] = model;
      resolvingModelKeys.delete(modelKey);
      return model;
    }
    const definition = model.historicalDefinitions.find(
      historicalDefinition => historicalDefinition.version === requestedVersion,
    );
    if (definition === undefined) {
      throw new Error(
        `makeZerospinApp: model "${modelKey}" version "${requestedVersion}" is unavailable`,
      );
    }

    let selectedModel: IModel;
    if ('sourceModel' in model) {
      const sourceModel = Reflect.get(model, 'sourceModel');
      const serviceName = Reflect.get(model, 'serviceName');
      if (
        typeof sourceModel !== 'object' ||
        sourceModel === null ||
        !('historicalDefinitions' in sourceModel) ||
        !Array.isArray(sourceModel.historicalDefinitions) ||
        !('abbreviation' in sourceModel) ||
        typeof sourceModel.abbreviation !== 'string' ||
        !('modelName' in sourceModel) ||
        typeof sourceModel.modelName !== 'string' ||
        typeof serviceName !== 'string'
      ) {
        throw new Error(
          `makeZerospinApp: model replica "${modelKey}" has an invalid source model`,
        );
      }
      const sourceDefinition = sourceModel.historicalDefinitions.find(
        historicalDefinition =>
          historicalDefinition.version === requestedVersion,
      );
      if (sourceDefinition === undefined) {
        throw new Error(
          `makeZerospinApp: model replica "${modelKey}" source version "${requestedVersion}" is unavailable`,
        );
      }
      const sourceAttributes = Object.fromEntries(
        Object.keys(sourceDefinition.attributes).map(attributeName => {
          const descriptor = Reflect.get(
            sourceDefinition.attributes,
            attributeName,
          );
          if (descriptor.kind !== PrimitiveKind.Ref) {
            return [attributeName, descriptor];
          }
          const targetEntry = Object.entries(controller.models).find(
            ([, candidate]) => {
              const candidateSourceModel =
                'sourceModel' in candidate
                  ? Reflect.get(candidate, 'sourceModel')
                  : undefined;
              return (
                candidate.table === descriptor.table ||
                (typeof candidateSourceModel === 'object' &&
                  candidateSourceModel !== null &&
                  'table' in candidateSourceModel &&
                  candidateSourceModel.table === descriptor.table)
              );
            },
          );
          if (targetEntry === undefined) {
            throw new Error(
              `makeZerospinApp: model "${modelKey}" references unselected model "${descriptor.targetTableName}"`,
            );
          }
          const resolvedTarget = resolveModel(targetEntry[0]);
          if ('sourceModel' in resolvedTarget) {
            const resolvedTargetSourceModel = Reflect.get(
              resolvedTarget,
              'sourceModel',
            );
            if (
              typeof resolvedTargetSourceModel !== 'object' ||
              resolvedTargetSourceModel === null ||
              !('table' in resolvedTargetSourceModel)
            ) {
              throw new Error(
                `makeZerospinApp: selected model replica "${targetEntry[0]}" has an invalid source model`,
              );
            }
            return [
              attributeName,
              { ...descriptor, table: resolvedTargetSourceModel.table },
            ];
          }
          return [
            attributeName,
            { ...descriptor, table: resolvedTarget.table },
          ];
        }),
      );
      const selectedSourceModel = Reflect.apply(makeModel, undefined, [
        {
          abbreviation: sourceModel.abbreviation,
          modelName: sourceModel.modelName,
          attributes: sourceAttributes,
          propertiesShape: {
            ...sourceDefinition.propertiesShape,
            ...sourceAttributes,
          },
          indexes: sourceDefinition.indexes,
          version: requestedVersion,
        },
        [],
      ]);
      selectedModel = makeReplica({
        sourceModel: selectedSourceModel,
        serviceName,
      });
    } else {
      const attributes = Object.fromEntries(
        Object.keys(definition.attributes).map(attributeName => {
          const descriptor = Reflect.get(definition.attributes, attributeName);
          if (descriptor.kind !== PrimitiveKind.Ref) {
            return [attributeName, descriptor];
          }
          const targetEntry = Object.entries(controller.models).find(
            ([, candidate]) => {
              const candidateSourceModel =
                'sourceModel' in candidate
                  ? Reflect.get(candidate, 'sourceModel')
                  : undefined;
              return (
                candidate.table === descriptor.table ||
                (typeof candidateSourceModel === 'object' &&
                  candidateSourceModel !== null &&
                  'table' in candidateSourceModel &&
                  candidateSourceModel.table === descriptor.table)
              );
            },
          );
          if (targetEntry === undefined) {
            throw new Error(
              `makeZerospinApp: model "${modelKey}" references unselected model "${descriptor.targetTableName}"`,
            );
          }
          return [
            attributeName,
            { ...descriptor, table: resolveModel(targetEntry[0]).table },
          ];
        }),
      );
      selectedModel = Reflect.apply(makeModel, undefined, [
        {
          abbreviation: model.abbreviation,
          modelName: model.modelName,
          attributes,
          propertiesShape: { ...definition.propertiesShape, ...attributes },
          indexes: definition.indexes,
          version: requestedVersion,
        },
        [],
      ]);
    }
    selectedModels[modelKey] = selectedModel;
    resolvingModelKeys.delete(modelKey);
    return selectedModel;
  };
  for (const modelKey of Object.keys(controller.models)) {
    resolveModel(modelKey);
  }

  const selectedContracts: IContracts = {};
  for (const [contractKey, contract] of Object.entries(controller.contracts)) {
    const requestedVersion =
      (props.entry.contracts === undefined
        ? undefined
        : Reflect.get(props.entry.contracts, contractKey)) ?? contract.version;
    if (requestedVersion === contract.version) {
      selectedContracts[contractKey] = contract;
      continue;
    }
    const definition = contract.historicalDefinitions.find(
      historicalDefinition => historicalDefinition.version === requestedVersion,
    );
    if (definition === undefined) {
      throw new Error(
        `makeZerospinApp: contract "${contractKey}" version "${requestedVersion}" is unavailable`,
      );
    }
    const contractProps =
      contract.mutations === null
        ? {
            commandName: contract.commandName,
            payload: definition.payload,
            version: definition.version,
            mutations: null,
          }
        : {
            commandName: contract.commandName,
            payload: definition.payload,
            version: definition.version,
            mutations: contract.mutations,
            program: ({ payload }: { payload: unknown }) =>
              definition
                .adaptPayload({ payload })
                .pipe(
                  Effect.flatMap(currentPayload =>
                    contract.program({ payload: currentPayload }),
                  ),
                ),
          };
    selectedContracts[contractKey] = Reflect.apply(makeContract, undefined, [
      contractProps,
      [],
    ]);
  }

  return Reflect.apply(makeFrontendController, undefined, [
    {
      ...controller,
      contracts: selectedContracts,
      models: selectedModels,
    },
  ]);
}
