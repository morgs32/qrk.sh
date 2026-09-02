import { ZerospinError, type IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/schema';
import { Effect, type Schema } from 'effect';

import type { IModel, IModelReplica, IModels } from '../models/types.ts';

import type { MutationValues } from './makeContract.ts';
import type { IAnyMutation, IContract, IContracts } from './types.ts';

type InferContractMutations<CONTRACT extends IContract> =
  CONTRACT extends IContract<
    string,
    infer _PAYLOAD,
    string,
    infer MUTATIONS_SCHEMA
  >
    ? MUTATIONS_SCHEMA extends Schema.Codec<unknown, unknown>
      ? Schema.Schema.Type<MUTATIONS_SCHEMA>
      : never
    : never;

type InferContractReturnedMutations<CONTRACT extends IContract> =
  MutationValues<InferContractMutations<CONTRACT>>;

export const assertMutationsUseModels = Effect.fn('assertMutationsUseModels')(
  function* (props: {
    mutations: readonly IAnyMutation[];
    models: IModels;
    owner: { kind: 'aggregate' } | { kind: 'service'; serviceName: string };
    commandName: string;
  }): Effect.fn.Return<void, IAnyError> {
    const { mutations, models, owner, commandName } = props;

    for (const mutation of mutations) {
      const modelName = mutation.model.modelName;
      const controllerModel = models[modelName];
      if (controllerModel !== mutation.model) {
        return yield* new ZerospinError({
          code: 'contract-mutation-model-out-of-scope',
          message: `Contract "${commandName}" emitted a mutation for model "${modelName}" outside the passed controller models`,
          extra: {
            commandName,
            modelName,
          },
        });
      }

      const isReplica = 'sourceModel' in mutation.model;
      if (owner.kind === 'aggregate') {
        if (mutation.operationName === 'replicateResource' && isReplica) {
          continue;
        }
        if (mutation.operationName !== 'replicateResource' && !isReplica) {
          continue;
        }
      } else if (mutation.operationName !== 'replicateResource' && !isReplica) {
        continue;
      }

      return yield* new ZerospinError({
        code: 'contract-mutation-model-owner-mismatch',
        message: `Contract "${commandName}" emitted ${mutation.operationName} for model "${modelName}" outside its ${owner.kind} mutation ownership`,
        extra: { commandName, modelName },
      });
    }
  },
);

export type AssertMutationModelInModels<
  MUTATION,
  MODELS extends IModels,
  OWNER extends 'aggregate' | 'service' = 'aggregate',
> = [MUTATION] extends [never]
  ? MODELS
  : MUTATION extends {
        readonly operationName: 'replicateResource';
        readonly model: infer MODEL extends IModel;
      }
    ? OWNER extends 'service'
      ? ITypeError<'service contracts cannot replicate resources'>
      : MODEL extends IModelReplica
        ? string extends MODEL['modelName']
          ? MODELS
          : MODEL['modelName'] extends keyof MODELS & string
            ? MODELS[MODEL['modelName']] extends MODEL
              ? MODEL extends MODELS[MODEL['modelName']]
                ? MODELS
                : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
              : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
            : ITypeError<`mutation model "${MODEL['modelName']}" is not registered on controller models`>
        : ITypeError<'replicateResource requires a model replica'>
    : MUTATION extends { readonly model: infer MODEL extends IModel }
      ? OWNER extends 'aggregate'
        ? MODEL extends IModelReplica
          ? ITypeError<`model replica "${MODEL['modelName']}" can only use replicateResource in aggregate contracts`>
          : string extends MODEL['modelName']
            ? MODELS
            : MODEL['modelName'] extends keyof MODELS & string
              ? MODELS[MODEL['modelName']] extends MODEL
                ? MODEL extends MODELS[MODEL['modelName']]
                  ? MODELS
                  : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
                : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
              : ITypeError<`mutation model "${MODEL['modelName']}" is not registered on controller models`>
        : MODEL extends IModelReplica
          ? ITypeError<`service contracts cannot mutate model replica "${MODEL['modelName']}"`>
          : string extends MODEL['modelName']
            ? MODELS
            : MODEL['modelName'] extends keyof MODELS & string
              ? MODELS[MODEL['modelName']] extends MODEL
                ? MODEL extends MODELS[MODEL['modelName']]
                  ? MODELS
                  : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
                : ITypeError<`mutation model "${MODEL['modelName']}" must match the registered controller model`>
              : ITypeError<`mutation model "${MODEL['modelName']}" is not registered on controller models`>
      : ITypeError<'contract program returned a non-mutation'>;

export type AssertContractMutationsInModels<
  CONTRACT extends IContract,
  MODELS extends IModels,
  OWNER extends 'aggregate' | 'service' = 'aggregate',
> =
  AssertMutationModelInModels<
    InferContractReturnedMutations<CONTRACT>,
    MODELS,
    OWNER
  > extends infer RESULT
    ? Exclude<RESULT, MODELS> extends never
      ? CONTRACT
      : Exclude<RESULT, MODELS> extends ITypeError<infer MESSAGE>
        ? ITypeError<`Contract "${CONTRACT['commandName']}" ${MESSAGE}`>
        : Exclude<RESULT, MODELS>
    : never;

export type AssertContractsMutationsInModels<
  CONTRACTS extends IContracts,
  MODELS extends IModels,
  OWNER extends 'aggregate' | 'service' = 'aggregate',
> = [keyof CONTRACTS & string] extends [never]
  ? CONTRACTS
  : {
        [K in keyof CONTRACTS & string]: AssertContractMutationsInModels<
          CONTRACTS[K],
          MODELS,
          OWNER
        >;
      }[keyof CONTRACTS & string] extends infer RESULT
    ? Exclude<RESULT, CONTRACTS[keyof CONTRACTS & string]> extends never
      ? CONTRACTS
      : Exclude<RESULT, CONTRACTS[keyof CONTRACTS & string]>
    : never;
