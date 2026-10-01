export {
  execute,
  makeMachine,
  push,
} from '@zerospin/core/machine/makeMachine/makeMachine';
export { makeState } from '@zerospin/core/machine/makeState/makeState';
export type {
  IAnyMachine,
  IMachineExecuteResult,
  IMachinePushReceipt,
  InferMachineValue,
  InferStateValue,
} from '@zerospin/core/machine/types';
export { makeGuard } from '@zerospin/core/guards/make/makeGuard';
export { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
export {
  makeAggregateVersion,
  upgradeAggregateVersion,
} from '@zerospin/core/aggregate/make/makeAggregateVersion';
export { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
export { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
export { updateAggregateActorVersion } from '@zerospin/core/aggregateActor/updateAggregateActorVersion';
export type {
  IAggregateActorAuthorization,
  IAggregateActorSelections,
  IAnyAggregateActorVersion,
} from '@zerospin/core/aggregateActor/types';
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
export { makeCommand } from '@zerospin/core/makeCommand';
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
export { makeService } from '@zerospin/core/service/make/makeService';
export { defineServiceActor } from '@zerospin/core/serviceActor/defineServiceActor';
export { makeServiceActorVersion } from '@zerospin/core/serviceActor/make/makeServiceActorVersion';
export { updateServiceActorVersion } from '@zerospin/core/serviceActor/updateServiceActorVersion';
export type {
  IAnyServiceActorVersion,
  IServiceActorAuthorization,
  IServiceActorSelections,
} from '@zerospin/core/serviceActor/types';
export { PublishableKey } from '@zerospin/core/services/PublishableKey';
export { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
export { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
export { makeSystemConfig } from '@zerospin/core/system/make/makeSystemConfig';
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
export { ZEROSPIN_SDK_VERSION } from './version.js';

export {
  resolveFailure,
  resolveSessionFailure,
} from '@zerospin/core/contracts/failureCodec';
export type { InferFailure } from '@zerospin/core/contracts/types';

export { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
export { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';

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
