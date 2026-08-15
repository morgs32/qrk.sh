import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type {
  IAggregateCommand,
  ICommand,
  IContracts,
  IOperationName,
} from '../contracts/types.ts';
import type {
  IAggregateAuthorization,
  IAnyAggregateFrontendBinding,
} from '../frontendBinding/types.ts';
import type { ISelection } from '../models/makeSelection.ts';
import type {
  IAggregateId,
  IModel,
  IModels,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import type { IAnyServiceQuery } from '../service/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

export type IUserRef<USER_ID extends string = string> = Readonly<{
  aggregateName: string;
  aggregateId: IAggregateId;
  userId: USER_ID;
}>;

export type IAggregate<
  NAME extends string = string,
  MODELS extends IModels = IModels,
  CONTRACTS extends IContracts = IContracts,
  MUTATION_ADAPTERS extends Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: unknown;
        }[]
      >
    >
  > = Record<
    string,
    Partial<
      Record<
        IOperationName,
        readonly {
          source: Schema.Schema.AnyNoContext;
          destination: Schema.Schema.AnyNoContext | null;
          adapter?: unknown;
        }[]
      >
    >
  >,
  SELECTIONS extends Record<string, ISelection<IModel>> = Record<
    string,
    ISelection<IModel>
  >,
  QUERIES extends Record<string, IAnyServiceQuery> = Record<
    string,
    IAnyServiceQuery
  >,
  FRONTENDS extends Record<string, IAnyAggregateFrontendBinding> = Record<
    string,
    IAnyAggregateFrontendBinding
  >,
  AUTHORIZE extends IAggregateAuthorization<FRONTENDS, MODELS, never> =
    IAggregateAuthorization<FRONTENDS, MODELS, never>,
> = {
  name: NAME;
  models: MODELS;
  contracts: CONTRACTS;
  mutationAdapters: MUTATION_ADAPTERS | undefined;
  selections: SELECTIONS;
  queries: QUERIES;
  frontends: FRONTENDS;
  makeCommand: <CONTRACT_NAME extends keyof CONTRACTS & string>(props: {
    contractName: CONTRACT_NAME;
    aggregateId: IAggregateId;
    systemName: string;
    payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
  }) => Effect.Effect<
    IAggregateCommand<
      ICommand<
        CONTRACTS[CONTRACT_NAME]['commandName'],
        CONTRACTS[CONTRACT_NAME]['version'],
        InferCommandPayload<CONTRACTS[CONTRACT_NAME]['payload']>
      >
    >,
    IAnyError,
    CuidFactory
  >;
} & ([keyof FRONTENDS] extends [never]
  ? { authorize?: never }
  : { authorize: AUTHORIZE });

export type IAnyAggregate = {
  name: string;
  models: IModels;
  contracts: IContracts;
  mutationAdapters:
    | Record<
        string,
        Partial<
          Record<
            IOperationName,
            readonly {
              source: Schema.Schema.AnyNoContext;
              destination: Schema.Schema.AnyNoContext | null;
              adapter?: unknown;
            }[]
          >
        >
      >
    | undefined;
  selections: Record<string, ISelection<IModel>>;
  queries: Record<string, IAnyServiceQuery>;
  frontends: Record<string, IAnyAggregateFrontendBinding>;
  authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError>;
  }['bivarianceHack'];
  makeCommand: (props: never) => Effect.Effect<unknown, IAnyError, CuidFactory>;
};

export type IAggregates = Record<string, IAnyAggregate>;
