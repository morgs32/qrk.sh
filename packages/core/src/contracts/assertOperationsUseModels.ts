import { makeZerospinError, type IAnyError } from '@zerospin/error';
import type { ITypeError } from '@zerospin/shapes';
import { Effect } from 'effect';

import { assertSameCoreInstance } from '../assertSameCoreInstance.ts';
import { Model } from '../models/defineModel.ts';
import type { IAnyModels, IModel } from '../models/types.ts';

import type {
  IAnyContracts,
  IAnyOperation,
  IContract,
  InferContractOperations,
} from './types.ts';
export const assertOperationsUseModels = Effect.fn('assertOperationsUseModels')(
  function* (props: {
    operations: readonly IAnyOperation[];
    models: IAnyModels;
    commandName: string;
  }): Effect.fn.Return<void, IAnyError> {
    const { operations, models, commandName } = props;
    for (const operation of operations) {
      if (operation !== null && typeof operation === 'object') {
        assertSameCoreInstance({
          value: operation.model,
          expected: Model,
          kind: 'Model',
        });
      }
      if (
        operation === null ||
        typeof operation !== 'object' ||
        !(operation.model instanceof Model) ||
        operation.modelVersion !== operation.model.version ||
        !['create', 'update', 'delete', 'move'].includes(
          operation.operationName,
        )
      ) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'contract-program-operation-invalid',
            message: `Contract "${commandName}" must return operations bound to their exact model version`,
          }),
        );
      }
      const modelName = operation.model.modelName;
      const controllerModel = models[modelName];
      if (controllerModel !== operation.model) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'contract-operation-model-out-of-scope',
            message: `Contract "${commandName}" emitted an operation for model "${modelName}" outside the passed controller models`,
            extra: {
              commandName,
              modelName,
            },
          }),
        );
      }
    }
  },
);
export type AssertOperationModelInModels<
  OPERATION,
  MODELS extends IAnyModels,
> = [OPERATION] extends [never]
  ? MODELS
  : OPERATION extends { readonly model: infer MODEL extends IModel }
    ? string extends MODEL['modelName']
      ? MODELS
      : MODEL['modelName'] extends keyof MODELS & string
        ? MODELS[MODEL['modelName']] extends MODEL
          ? MODEL extends MODELS[MODEL['modelName']]
            ? MODELS
            : ITypeError<`operation model "${MODEL['modelName']}" must match the registered controller model`>
          : ITypeError<`operation model "${MODEL['modelName']}" must match the registered controller model`>
        : ITypeError<`operation model "${MODEL['modelName']}" is not registered on controller models`>
    : OPERATION extends { readonly operationName: 'async' }
      ? MODELS
      : ITypeError<'contract program emitted a non-operation'>;
export type AssertContractOperationsInModels<
  CONTRACT extends IContract,
  MODELS extends IAnyModels,
> =
  AssertOperationModelInModels<
    InferContractOperations<CONTRACT>,
    MODELS
  > extends infer RESULT
    ? Extract<RESULT, ITypeError<string>> extends never
      ? CONTRACT
      : Extract<RESULT, ITypeError<string>> extends ITypeError<infer MESSAGE>
        ? ITypeError<`Contract "${CONTRACT['commandName']}" ${MESSAGE}`>
        : Extract<RESULT, ITypeError<string>>
    : never;
export type AssertContractsOperationsInModels<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
> = [keyof CONTRACTS & string] extends [never]
  ? CONTRACTS
  : {
        [K in keyof CONTRACTS & string]: AssertContractOperationsInModels<
          CONTRACTS[K],
          MODELS
        >;
      }[keyof CONTRACTS & string] extends infer RESULT
    ? Exclude<RESULT, CONTRACTS[keyof CONTRACTS & string]> extends never
      ? CONTRACTS
      : Exclude<RESULT, CONTRACTS[keyof CONTRACTS & string]>
    : never;
