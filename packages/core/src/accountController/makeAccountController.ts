import '@zerospin/server-only';
import type { IAnyError } from '@zerospin/error';
import { JSONSchema, Schema, type Effect } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';
import type { UnionToIntersection } from 'type-fest';

import type {
  IActorControllers,
  IAnyActorController,
} from '../actorController/types.ts';
import type { AssertContractsMutationsInModels } from '../contracts/assertMutationsUseModels.ts';
import type {
  IAccountCommand,
  ICommand,
  IContracts,
  IOperationName,
} from '../contracts/types.ts';
import { assertValidModels } from '../models/assertValidModels.ts';
import type {
  IAssertValidModels,
  IModel,
  IModels,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import type { ITypeError } from '../utils/types.ts';

import { makeAccountCommand } from './makeAccountCommand.ts';

/** Union of every actor models map (multi-actor accounts). */
type IMergedActorControllerModels<ACTOR_CONTROLLERS extends IActorControllers> =
  UnionToIntersection<ACTOR_CONTROLLERS[keyof ACTOR_CONTROLLERS]['models']>;

type IActorFrontendContracts<ACTOR extends IAnyActorController> =
  ACTOR['frontends'][keyof ACTOR['frontends']]['contracts'];

/** Union of every actor frontend binding `contracts` map (multi-actor accounts). */
type IMergedActorFrontendContracts<
  ACTOR_CONTROLLERS extends IActorControllers,
> = UnionToIntersection<
  IActorFrontendContracts<ACTOR_CONTROLLERS[keyof ACTOR_CONTROLLERS]>
>;

type AssertModelConsistency<
  ACCOUNT_MODELS extends IModels,
  ACTOR_CONTROLLERS extends IActorControllers,
> = {
  [ACTOR_KEY in keyof ACTOR_CONTROLLERS & string]: {
    [FRONTEND_KEY in keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'] &
      string]: {
      [FRONTEND_MODEL_KEY in keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'][FRONTEND_KEY]['models'] &
        string]: ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'][FRONTEND_KEY]['models'][FRONTEND_MODEL_KEY] extends infer FRONTEND_MODEL extends
        IModel
        ? string extends FRONTEND_MODEL['modelName']
          ? ACCOUNT_MODELS
          : FRONTEND_MODEL['modelName'] extends keyof ACCOUNT_MODELS & string
            ? ACCOUNT_MODELS[FRONTEND_MODEL['modelName']] extends FRONTEND_MODEL
              ? FRONTEND_MODEL extends ACCOUNT_MODELS[FRONTEND_MODEL['modelName']]
                ? ACCOUNT_MODELS
                : ITypeError<`Frontend binding model "${ACTOR_KEY}.${FRONTEND_KEY}.${FRONTEND_MODEL_KEY}" must match account model "${FRONTEND_MODEL['modelName']}"`>
              : ITypeError<`Frontend binding model "${ACTOR_KEY}.${FRONTEND_KEY}.${FRONTEND_MODEL_KEY}" must match account model "${FRONTEND_MODEL['modelName']}"`>
            : ITypeError<`Frontend binding model "${ACTOR_KEY}.${FRONTEND_KEY}.${FRONTEND_MODEL_KEY}" uses modelName "${FRONTEND_MODEL['modelName']}" missing from account models`>
        : never;
    }[keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'][FRONTEND_KEY]['models'] &
      string];
  }[keyof ACTOR_CONTROLLERS[ACTOR_KEY]['frontends'] & string];
}[keyof ACTOR_CONTROLLERS & string] extends infer RESULT
  ? Exclude<RESULT, ACCOUNT_MODELS> extends never
    ? ACCOUNT_MODELS
    : Exclude<RESULT, ACCOUNT_MODELS>
  : never;

export type IAccountController<
  NAME extends string = string,
  ACTOR_CONTROLLERS extends IActorControllers = IActorControllers,
  MODELS extends IModels = IModels,
  CONTRACTS extends IContracts = IContracts,
  MUTATION_ADAPTERS extends Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: unknown;
        }[]
      >
    >
  > = Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: unknown;
        }[]
      >
    >
  >,
  VERSION extends string = string,
> = {
  name: NAME;
  version: VERSION;
  actorControllers: ACTOR_CONTROLLERS;
  models: MODELS;
  contracts: CONTRACTS;
  mutationAdapters: MUTATION_ADAPTERS | undefined;
  makeCommand: <CONTRACT_NAME extends keyof CONTRACTS & string>(props: {
    contractName: CONTRACT_NAME;
    accountId: string;
    systemName: string;
    systemVersion: string;
    payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
  }) => Effect.Effect<
    IAccountCommand<
      ICommand<
        CONTRACTS[CONTRACT_NAME]['commandName'],
        CONTRACTS[CONTRACT_NAME]['version'],
        InferCommandPayload<CONTRACTS[CONTRACT_NAME]['payload']>
      >
    >,
    IAnyError,
    CuidFactory
  >;
};

type AccountContractsExtendFrontend<
  ACCOUNT_CONTRACTS extends IContracts,
  FRONTEND_CONTRACTS extends IContracts,
> = keyof FRONTEND_CONTRACTS & string extends keyof ACCOUNT_CONTRACTS & string
  ? ACCOUNT_CONTRACTS
  : ITypeError<'Account contracts must include every frontend binding contract key'>;

export function makeAccountController<
  NAME extends string,
  ACTOR_CONTROLLERS extends IActorControllers,
  MODELS extends IModels,
  CONTRACTS extends IContracts,
  MUTATION_ADAPTERS extends Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: unknown;
        }[]
      >
    >
  >,
  VERSION extends string,
>(props: {
  name: NAME;
  version: VERSION;
  actorControllers: ACTOR_CONTROLLERS & {
    [K in keyof ACTOR_CONTROLLERS & string]: ACTOR_CONTROLLERS[K] extends {
      name: K;
    }
      ? ACTOR_CONTROLLERS[K]
      : ITypeError<`Bad actorController "${K}". The key in actorControllers should match actorController.name`>;
  };
  models: MODELS &
    IAssertValidModels<MODELS> &
    (keyof IMergedActorControllerModels<ACTOR_CONTROLLERS> extends keyof MODELS
      ? IMergedActorControllerModels<ACTOR_CONTROLLERS> extends Pick<
          MODELS,
          keyof IMergedActorControllerModels<ACTOR_CONTROLLERS> & keyof MODELS
        >
        ? Pick<
            MODELS,
            keyof IMergedActorControllerModels<ACTOR_CONTROLLERS> & keyof MODELS
          > extends IMergedActorControllerModels<ACTOR_CONTROLLERS>
          ? MODELS
          : ITypeError<'Account models must include every exact actor model'>
        : ITypeError<'Account models must include every exact actor model'>
      : ITypeError<'Account models must include every exact actor model'>) &
    AssertModelConsistency<MODELS, ACTOR_CONTROLLERS>;
  contracts: CONTRACTS &
    AccountContractsExtendFrontend<
      CONTRACTS,
      IMergedActorFrontendContracts<ACTOR_CONTROLLERS>
    > &
    AssertContractsMutationsInModels<CONTRACTS, MODELS>;
  mutationAdapters?: MUTATION_ADAPTERS & {
    [MODEL_NAME in keyof MUTATION_ADAPTERS]: MUTATION_ADAPTERS[MODEL_NAME] extends infer OPERATIONS extends Record<
      string,
      unknown
    >
      ? {
          [OPERATION_NAME in keyof OPERATIONS]: OPERATIONS[OPERATION_NAME] extends infer EDGES extends readonly unknown[]
            ? {
                readonly [INDEX in keyof EDGES]: EDGES[INDEX] extends infer EDGE extends {
                  source: Schema.Schema.AnyNoContext;
                  destination: Schema.Schema.AnyNoContext | null;
                }
                  ? EDGE['destination'] extends infer DESTINATION extends Schema.Schema.AnyNoContext
                    ? {
                        source: EDGE['source'];
                        destination: DESTINATION;
                        adapter: (
                          mutation: Schema.Schema.Type<EDGE['source']>,
                        ) => Effect.Effect<
                          Schema.Schema.Type<DESTINATION>,
                          IAnyError,
                          never
                        >;
                      }
                    : {
                        source: EDGE['source'];
                        destination: null;
                        adapter?: never;
                      }
                  : never;
              }
            : never;
        }
      : never;
  };
}): IAccountController<
  NAME,
  ACTOR_CONTROLLERS,
  MODELS,
  CONTRACTS,
  MUTATION_ADAPTERS,
  VERSION
> {
  const {
    name,
    version,
    actorControllers,
    models,
    contracts,
    mutationAdapters,
  } = props;

  assertValidModels({ models, context: 'makeAccountController' });

  /**
   * Mutation-adapter validation checkpoints:
   * 1. Read identity only from each declared source/destination schema.
   * 2. Require historical source versions and current destination versions.
   * 3. Keep every edge direct; a historical destination would form a chain.
   * 4. Require retired account models to cover create/update/delete/move for
   *    the same complete source-version set.
   */
  for (const [sourceModelName, operationAdapters] of Object.entries(
    mutationAdapters ?? {},
  )) {
    const retiredVersionsByOperation = new Map<string, Set<string>>();

    for (const [operationName, edges] of Object.entries(operationAdapters)) {
      if (
        operationName !== 'create' &&
        operationName !== 'update' &&
        operationName !== 'delete' &&
        operationName !== 'move' &&
        operationName !== 'replicateResource'
      ) {
        throw new Error(
          `makeAccountController: mutationAdapters.${sourceModelName}.${operationName} is not a supported mutation operation`,
        );
      }
      if (operationName === 'replicateResource') {
        throw new Error(
          `makeAccountController: mutationAdapters.${sourceModelName}.replicateResource belongs to the source service controller`,
        );
      }
      if (!Array.isArray(edges)) {
        throw new Error(
          `makeAccountController: mutationAdapters.${sourceModelName}.${operationName} must be an array of direct edges`,
        );
      }

      const sourceVersions = new Set<string>();
      retiredVersionsByOperation.set(operationName, sourceVersions);

      for (const [edgeIndex, edge] of edges.entries()) {
        if (typeof edge !== 'object' || edge === null) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] must be an edge object`,
          );
        }

        const source = Reflect.get(edge, 'source');
        if (!Schema.isSchema(source)) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source must be a mutation schema`,
          );
        }

        const sourceJsonSchema = JSONSchema.make(source);
        const sourceProperties = Reflect.get(sourceJsonSchema, 'properties');
        if (typeof sourceProperties !== 'object' || sourceProperties === null) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has no mutation identity`,
          );
        }
        const sourceModelNameProperty = Reflect.get(
          sourceProperties,
          'modelName',
        );
        const sourceModelVersionProperty = Reflect.get(
          sourceProperties,
          'modelVersion',
        );
        const sourceOperationNameProperty = Reflect.get(
          sourceProperties,
          'operationName',
        );
        if (
          typeof sourceModelNameProperty !== 'object' ||
          sourceModelNameProperty === null ||
          typeof sourceModelVersionProperty !== 'object' ||
          sourceModelVersionProperty === null ||
          typeof sourceOperationNameProperty !== 'object' ||
          sourceOperationNameProperty === null
        ) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].source has incomplete mutation identity`,
          );
        }
        const sourceModelNames = Reflect.get(sourceModelNameProperty, 'enum');
        const sourceModelVersions = Reflect.get(
          sourceModelVersionProperty,
          'enum',
        );
        const sourceOperationNames = Reflect.get(
          sourceOperationNameProperty,
          'enum',
        );
        const schemaSourceModelName = Array.isArray(sourceModelNames)
          ? sourceModelNames[0]
          : undefined;
        const schemaSourceModelVersion = Array.isArray(sourceModelVersions)
          ? sourceModelVersions[0]
          : undefined;
        const schemaSourceOperationName = Array.isArray(sourceOperationNames)
          ? sourceOperationNames[0]
          : undefined;

        if (schemaSourceModelName !== sourceModelName) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelName is "${String(schemaSourceModelName)}"`,
          );
        }
        if (schemaSourceOperationName !== operationName) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source operationName is "${String(schemaSourceOperationName)}"`,
          );
        }
        if (typeof schemaSourceModelVersion !== 'string') {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source modelVersion is missing`,
          );
        }
        if (sourceVersions.has(schemaSourceModelVersion)) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName} repeats source version "${schemaSourceModelVersion}"`,
          );
        }
        sourceVersions.add(schemaSourceModelVersion);

        const sourceModel = models[sourceModelName];
        if (sourceModel !== undefined) {
          if ('serviceName' in sourceModel) {
            throw new Error(
              `makeAccountController: mutationAdapters.${sourceModelName} belongs to its service controller`,
            );
          }
          if (schemaSourceModelVersion === sourceModel.version) {
            throw new Error(
              `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is current; adapter sources must be historical`,
            );
          }
          if (
            !sourceModel.historicalDefinitions.some(
              definition => definition.version === schemaSourceModelVersion,
            )
          ) {
            throw new Error(
              `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] source version "${schemaSourceModelVersion}" is not declared by model "${sourceModelName}"`,
            );
          }
        }

        const destination = Reflect.get(edge, 'destination');
        const adapter = Reflect.get(edge, 'adapter');
        if (destination === null) {
          if (adapter !== undefined) {
            throw new Error(
              `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] null destination must omit adapter`,
            );
          }
          continue;
        }
        if (!Schema.isSchema(destination)) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination must be a current mutation schema or null`,
          );
        }
        if (typeof adapter !== 'function') {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] non-null destination requires adapter`,
          );
        }

        const destinationJsonSchema = JSONSchema.make(destination);
        const destinationProperties = Reflect.get(
          destinationJsonSchema,
          'properties',
        );
        if (
          typeof destinationProperties !== 'object' ||
          destinationProperties === null
        ) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has no mutation identity`,
          );
        }
        const destinationModelNameProperty = Reflect.get(
          destinationProperties,
          'modelName',
        );
        const destinationModelVersionProperty = Reflect.get(
          destinationProperties,
          'modelVersion',
        );
        const destinationOperationNameProperty = Reflect.get(
          destinationProperties,
          'operationName',
        );
        if (
          typeof destinationModelNameProperty !== 'object' ||
          destinationModelNameProperty === null ||
          typeof destinationModelVersionProperty !== 'object' ||
          destinationModelVersionProperty === null ||
          typeof destinationOperationNameProperty !== 'object' ||
          destinationOperationNameProperty === null
        ) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}].destination has incomplete mutation identity`,
          );
        }
        const destinationModelNames = Reflect.get(
          destinationModelNameProperty,
          'enum',
        );
        const destinationModelVersions = Reflect.get(
          destinationModelVersionProperty,
          'enum',
        );
        const destinationOperationNames = Reflect.get(
          destinationOperationNameProperty,
          'enum',
        );
        const destinationModelName = Array.isArray(destinationModelNames)
          ? destinationModelNames[0]
          : undefined;
        const destinationModelVersion = Array.isArray(destinationModelVersions)
          ? destinationModelVersions[0]
          : undefined;
        const destinationOperationName = Array.isArray(
          destinationOperationNames,
        )
          ? destinationOperationNames[0]
          : undefined;
        if (typeof destinationModelName !== 'string') {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination modelName is missing`,
          );
        }
        const destinationModel = models[destinationModelName];
        if (destinationModel === undefined || 'serviceName' in destinationModel) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination model "${destinationModelName}" is not an account model on this controller`,
          );
        }
        if (destinationModelVersion !== destinationModel.version) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination version "${String(destinationModelVersion)}" is not current version "${destinationModel.version}"`,
          );
        }
        if (destinationOperationName !== operationName) {
          throw new Error(
            `makeAccountController: mutationAdapters.${sourceModelName}.${operationName}[${edgeIndex}] destination operationName is "${String(destinationOperationName)}"`,
          );
        }
      }
    }

    if (models[sourceModelName] === undefined) {
      const createVersions = retiredVersionsByOperation.get('create');
      for (const requiredOperationName of [
        'create',
        'update',
        'delete',
        'move',
      ]) {
        const operationVersions = retiredVersionsByOperation.get(
          requiredOperationName,
        );
        if (
          createVersions === undefined ||
          createVersions.size === 0 ||
          operationVersions === undefined ||
          operationVersions.size !== createVersions.size
        ) {
          throw new Error(
            `makeAccountController: retired model "${sourceModelName}" must exhaustively adapt or discard every create/update/delete/move source version`,
          );
        }
        for (const sourceVersion of createVersions) {
          if (!operationVersions.has(sourceVersion)) {
            throw new Error(
              `makeAccountController: retired model "${sourceModelName}" is missing ${requiredOperationName} adapter for source version "${sourceVersion}"`,
            );
          }
        }
      }
    }
  }

  mapValues(actorControllers, (actorController, key) => {
    const actorControllerKey = String(key);
    if (actorController.name !== actorControllerKey) {
      throw new Error(
        `makeAccountController: actorControllers.${actorControllerKey} must have name "${actorControllerKey}", received "${actorController.name}"`,
      );
    }

    return actorController;
  });

  for (const [actorControllerKey, actorController] of Object.entries(
    actorControllers,
  )) {
    for (const [actorModelKey, actorModel] of Object.entries(
      actorController.models,
    )) {
      if (models[actorModelKey] !== actorModel) {
        throw new Error(
          `makeAccountController: actorControllers.${actorControllerKey}.models.${actorModelKey} must be the same object as account models.${actorModelKey}`,
        );
      }
    }

    for (const [frontendName, frontendBinding] of Object.entries(
      actorController.frontends,
    )) {
      for (const [frontendModelKey, frontendModel] of Object.entries(
        frontendBinding.models,
      )) {
        const accountModel = models[frontendModel.modelName];
        if (accountModel === undefined) {
          throw new Error(
            `makeAccountController: actorControllers.${actorControllerKey}.frontends.${frontendName}.models.${frontendModelKey} uses modelName "${frontendModel.modelName}" missing from account models`,
          );
        }

        if (!isEqual(accountModel.spec, frontendModel.spec)) {
          throw new Error(
            `makeAccountController: actorControllers.${actorControllerKey}.frontends.${frontendName}.models.${frontendModelKey} modelName "${frontendModel.modelName}" must match account models.${frontendModel.modelName}`,
          );
        }
      }
    }
  }

  const makeCommand: IAccountController<
    NAME,
    ACTOR_CONTROLLERS,
    MODELS,
    CONTRACTS,
    MUTATION_ADAPTERS,
    VERSION
  >['makeCommand'] = props =>
    makeAccountCommand({
      contracts,
      ...props,
      accountName: name,
    });

  return {
    name,
    version,
    actorControllers,
    models,
    contracts,
    mutationAdapters,
    makeCommand,
  };
}
