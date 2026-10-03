export { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
export {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from '@zerospin/core/aggregate/make/makeAggregateVersion';
export { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
export { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
export type {
  IAggregateActorAuthorization,
  IAggregateActorSelections,
  IAnyAggregateActorVersion,
} from '@zerospin/core/aggregateActor/types';
export { updateAggregateActorVersion } from '@zerospin/core/aggregateActor/updateAggregateActorVersion';
export { checkGuards } from '@zerospin/core/aggregateSession/checkGuards';
export { validateSessionCommand } from '@zerospin/core/aggregateSession/validateSessionCommand';
export { defineContract } from '@zerospin/core/contracts/defineContract';
export type { Command } from '@zerospin/core/contracts/defineContract';
export {
  resolveFailure,
  resolveSessionFailure,
} from '@zerospin/core/contracts/failureCodec';
export { mapContractVersion } from '@zerospin/core/contracts/make/mapContractVersion';
export { makeAsyncContract } from '@zerospin/core/contracts/make/makeAsyncContract';
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
export { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
export { makeCommand } from '@zerospin/core/makeCommand';
export { defineModel } from '@zerospin/core/models/defineModel';
export { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
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
export { defineService } from '@zerospin/core/service/defineService';
export { makeServiceVersion } from '@zerospin/core/service/make/makeServiceVersion';
export { defineServiceActor } from '@zerospin/core/serviceActor/defineServiceActor';
export { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
export type {
  IAnyServiceActorVersion,
  IServiceActorAuthorization,
  IServiceActorSelections,
} from '@zerospin/core/serviceActor/types';
export { updateServiceActorVersion } from '@zerospin/core/serviceActor/updateServiceActorVersion';
export { PublishableKey } from '@zerospin/core/services/PublishableKey';
export { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
export { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
export { makeSystemConfig } from '@zerospin/core/system/make/makeSystemConfig';
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
export { CuidFactory, primitives } from '@zerospin/schema';
export { ZEROSPIN_SDK_VERSION } from './version.js';

export { resolveContractResult } from '@zerospin/core/contracts/resultCodec';
export type {
  InferContractOperations,
  InferContractResult,
} from '@zerospin/core/contracts/types';

export { makeAgent } from '@zerospin/core/agent/makeAgent';

export type { IBrowserCommand } from '@zerospin/core/contracts/BrowserCommandSchema';

export type { IAsyncCommand } from '@zerospin/core/contracts/AsyncCommandSchema';
export type {
  IExecutedAggregateCommand,
  IExecutedServiceCommand,
} from '@zerospin/core/contracts/ExecutedCommandSchema';
export type { IStagedAggregateCommand } from '@zerospin/core/contracts/StagedAggregateCommandSchema';
