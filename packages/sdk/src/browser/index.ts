export { makeGuard } from '@zerospin/core/guards/make/makeGuard';
export { defineContract } from '@zerospin/core/contracts/defineContract';
export type { Command } from '@zerospin/core/contracts/defineContract';
export {
  makeContractVersion,
  upgradeContractVersion,
} from '@zerospin/core/contracts/make/makeContractVersion';
export type {
  IAggregateCommand,
  ICommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
export type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
export { defineModel } from '@zerospin/core/models/defineModel';
export { makeId } from '@zerospin/core/models/make/makeId';
export {
  makeModelVersion,
  upgradeModelVersion,
} from '@zerospin/core/models/make/makeModelVersion';
export { makeReplica } from '@zerospin/core/models/make/makeReplica';
export { prefixId } from '@zerospin/core/models/prefixId';
export type {
  IAggregateId,
  InferCommandPayload,
  InferPayloadInput,
  InferResource,
} from '@zerospin/core/models/types';
export { PublishableKey } from '@zerospin/core/services/PublishableKey';
export { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
export type { ISystemConfig, ISystemId } from '@zerospin/core/system/types';
export { makeAggregateId } from '@zerospin/core/utils/make/makeAggregateId';
export { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
export {
  catchZerospinError,
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
  type IZerospinError,
} from '@zerospin/error';
export { CuidFactory, primitives } from '@zerospin/schema';
export { ZEROSPIN_SDK_VERSION } from '../version.js';

export {
  resolveFailure,
  resolveSessionFailure,
} from '@zerospin/core/contracts/failureCodec';
export type { InferFailure } from '@zerospin/core/contracts/types';

export {
  ContractError,
  ActorError,
  AggregateError,
  ZerospinError,
  encodeError,
  type ErrorJson,
  type IZerospinErrorJson,
} from '@zerospin/error';
export { checkGuards } from '@zerospin/core/aggregateSession/checkGuards';
export { validateSessionCommand } from '@zerospin/core/aggregateSession/validateSessionCommand';

export {
  matchZerospinErrorCode,
  type IRecognizedFailure,
} from '@zerospin/error';
