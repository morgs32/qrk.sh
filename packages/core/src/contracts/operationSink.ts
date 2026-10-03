import { Context } from 'effect';

import type { IContractOutput } from './types.ts';

const operationType = Symbol('@zerospin/core/OperationSink.operation');
export type IOperationSink<OP extends IContractOutput = IContractOutput> = {
  readonly [operationType]: OP;
};
export const operationSink = <OP extends IContractOutput>() =>
  Context.Service<
    IOperationSink<OP>,
    { readonly emit: (operation: OP) => void }
  >('@zerospin/core/OperationSink');
export const emitOperation = <OP extends IContractOutput>(operation: OP) =>
  operationSink<OP>().useSync(sink => sink.emit(operation));
export type InferEmittedOperations<R> =
  R extends IOperationSink<infer OP> ? OP : never;
export type ExcludeOperationSink<R> = Exclude<R, IOperationSink>;
