import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

export type IManagedAggregateSession<
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = IAggregateSession<DEFINITION> & {
  readonly systemName: string;
  initialize(props: {
    getCredentials: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};

export type IManagedServiceSession<
  DEFINITION extends IServiceSessionDefinition = IServiceSessionDefinition,
  MODELS extends IAnyModels = DEFINITION['models'],
> = IServiceSession<DEFINITION, MODELS> & {
  readonly systemName: string;
  initialize(props: {
    getCredentials: () => Effect.Effect<unknown, IAnyError>;
  }): Promise<void>;
  dispose(): Promise<void>;
};
