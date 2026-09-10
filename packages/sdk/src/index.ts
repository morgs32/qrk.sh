export { aggregates } from '@zerospin/core/aggregate/index';
export * from '@zerospin/core/aggregate/makeAggregateCommand';
export * from '@zerospin/core/contracts/CommandSchema';
export * from '@zerospin/core/contracts/makeContractAdapter';
export { contracts, type Command } from '@zerospin/core/contracts/index';
export type {
  IContractBinding,
  IAnyContractBindings,
} from '@zerospin/core/contracts/types';
export * from '@zerospin/core/drizzle/makeProvisionedInMemoryWasmSqliteDb';
export * from '@zerospin/core/frontendController/makeFrontendController';
export * from '@zerospin/core/authentication/index';
export * from '@zerospin/core/frontendController/makeAggregateFrontendLock';
export * from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
export * from '@zerospin/core/frontendController/makeServiceFrontendLock';
export * from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
export { models } from '@zerospin/core/models/index';
export { Model } from '@zerospin/core/models/makeModel';
export * from '@zerospin/core/models/makeReplica';
export * from '@zerospin/core/models/makeSelection';
export {
  makeIdFromAbbreviation,
  primitives,
  type IDrizzleBooleanColumnBuilder,
  type IDrizzleEnumColumnBuilder,
  type IDrizzleIntegerColumnBuilder,
  type IDrizzleRealColumnBuilder,
  type IDrizzleTextColumnBuilder,
  type IDrizzleTimestampColumnBuilder,
  type InferDrizzleColumnBuilderData,
  type InferNullableDrizzleColumnBuilderData,
} from '@zerospin/schema';
export * from '@zerospin/core/session/makeAggregateSession';
export { makeService } from '@zerospin/core/service/makeService';
export * from '@zerospin/core/system/makeSystem';
export * from '@zerospin/core/utils/makeAggregateId';
export * from '@zerospin/error';
export * from './version.js';

export type {
  IAggregateFrontend,
  IServiceFrontend,
} from '@zerospin/core/frontendController/types';
