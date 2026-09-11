export { defineCommand } from '@zerospin/core/contracts/Command';
export {
  makeModel,
  makeModelVersion,
  upgradeModelVersion,
} from '@zerospin/core/models/makeModel';
export {
  makeContractVersion,
  upgradeContractVersion,
} from '@zerospin/core/contracts/makeVersion';
export { makeReplica } from '@zerospin/core/models/makeReplica';
export { makeSelection } from '@zerospin/core/models/makeSelection';
export { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
export { makeId } from '@zerospin/core/models/makeId';
export { prefixId } from '@zerospin/core/models/prefixId';
export { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
export { primitives, CuidFactory } from '@zerospin/schema';
export { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
export { PublishableKey } from '@zerospin/core/services/PublishableKey';
export { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
export {
  ZerospinError,
  type IAnyError,
  type IZerospinError,
} from '@zerospin/error';
export type { Command } from '@zerospin/core/contracts/Command';
export type {
  IContractBinding,
  IAnyContractBindings,
  ICommand,
  IServiceCommand,
  IAggregateCommand,
} from '@zerospin/core/contracts/types';
export type {
  IAggregateFrontend,
  IServiceFrontend,
} from '@zerospin/core/frontendController/types';
export type {
  InferResource,
  InferPayloadInput,
  InferCommandPayload,
  IAggregateId,
} from '@zerospin/core/models/types';
export type { ISystemId, ISystemConfig } from '@zerospin/core/system/types';
export type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
export { ZEROSPIN_SDK_VERSION } from '../version.js';
