import type { Async } from '@zerospin/core/async/Async';
import type {
  IAggregateFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import type { IAggregateSession } from '@zerospin/core/session/types';
import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import type { Effect, ManagedRuntime } from 'effect';

export type IZerospinRuntime<APP_SERVICES = never> =
  ManagedRuntime.ManagedRuntime<
    Async | CuidFactory | MonotonicFactory | APP_SERVICES,
    IAnyError
  >;

export type IManagedAggregateSession<
  FRONTEND extends IAggregateFrontendController = IAggregateFrontendController,
> = IAggregateSession<FRONTEND> & {
  readonly systemName: string;
  initialize(props: {
    generateSignature: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};

export type IManagedServiceSession<
  FRONTEND extends IServiceFrontendController = IServiceFrontendController,
  MODELS extends IAnyModels = FRONTEND['models'],
> = IServiceSession<FRONTEND, MODELS> & {
  readonly systemName: string;
  initialize(props: {
    generateSignature: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};
