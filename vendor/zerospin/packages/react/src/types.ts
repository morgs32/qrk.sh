import type { Async } from '@zerospin/core/async/Async';
import type {
  IAggregateFrontendController,
  IServiceFrontendController,
} from '@zerospin/core/frontendController/types';
import type { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { IServiceSession } from '@zerospin/core/serviceSession/types';
import type { ISession } from '@zerospin/core/session/types';
import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import type { ManagedRuntime } from 'effect';

export type IBrowserSession<
  FRONTEND extends IAggregateFrontendController = IAggregateFrontendController,
> = ISession<FRONTEND> & {
  coreSession: ISession<FRONTEND>;
};

export type ISessionProviderRuntime = ManagedRuntime.ManagedRuntime<
  Async | CuidFactory | MonotonicFactory | PublishableKey | ZerospinApiUrl,
  IAnyError
>;

export type IBrowserServiceSession<
  FRONTEND extends IServiceFrontendController = IServiceFrontendController,
> = IServiceSession<FRONTEND> & {
  coreSession: IServiceSession<FRONTEND>;
};
