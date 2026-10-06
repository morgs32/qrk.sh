export { checkGuards } from '@zerospin/core/aggregateSession/checkGuards';
export { validateSessionCommand } from '@zerospin/core/aggregateSession/validateSessionCommand';
export { defineContract } from '@zerospin/core/contracts/defineContract';
export type { Command } from '@zerospin/core/contracts/defineContract';
export {
  resolveFailure,
  resolveSessionFailure,
} from '@zerospin/core/contracts/failureCodec';
export {
  makeContractVersion,
  upgradeContractVersion,
} from '@zerospin/core/contracts/make/makeContractVersion';
export type {
  IAggregateCommand,
  ICommand,
  IServiceCommand,
  InferFailure,
} from '@zerospin/core/contracts/types';
export type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
export { makeGuard } from '@zerospin/core/guards/make/makeGuard';
export { defineModel } from '@zerospin/core/models/defineModel';
export { makeId } from '@zerospin/core/models/make/makeId';
export {
  makeModelVersion,
  upgradeModelVersion,
} from '@zerospin/core/models/make/makeModelVersion';
export { prefixId } from '@zerospin/core/models/prefixId';
export type {
  IAggregateId,
  InferCommandPayload,
  InferPayloadInput,
  InferResource,
} from '@zerospin/core/models/types';
export { PublishableKey } from '@zerospin/core/services/PublishableKey';
export { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
export { stageServiceCommand } from '@zerospin/core/serviceSession/stageServiceCommand';
export type { ISystemConfig, ISystemId } from '@zerospin/core/system/types';
export { makeAggregateId } from '@zerospin/core/utils/make/makeAggregateId';
export { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
export {
  ActorError,
  AggregateError,
  ContractError,
  ZerospinError,
  catchZerospinError,
  encodeError,
  isZerospinError,
  makeZerospinError,
  matchZerospinErrorCode,
  prettyUnknownFailure,
  type ErrorJson,
  type IAnyError,
  type IRecognizedFailure,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
export { CuidFactory, primitives } from '@zerospin/shapes';
export { ZEROSPIN_SDK_VERSION } from '../version.js';

export { resolveContractResult } from '@zerospin/core/contracts/resultCodec';
export type {
  InferContractOperations,
  InferContractResult,
} from '@zerospin/core/contracts/types';
export { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
