import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type {
  ICommand,
  IContracts,
  IOperationName,
  IServiceCommand,
} from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IAnyServiceFrontendBinding,
  IServiceAuthorization,
} from '../frontendBinding/types.ts';
import type {
  IModels,
  InferCommandPayload,
  InferPayloadInput,
} from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';

export type IServiceQuery<
  MODELS extends IModels = IModels,
  PARAMS_SCHEMA extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  RESULT = unknown,
> = {
  paramsSchema: PARAMS_SCHEMA;
  query: (props: {
    db: Readonly<
      Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
    >;
    params: Schema.Schema.Type<PARAMS_SCHEMA>;
  }) => Effect.Effect<RESULT, IAnyError>;
};

export type IResolvedServiceQuery<
  SERVICE_NAME extends string = string,
  QUERY_NAME extends string = string,
  MODELS extends IModels = IModels,
  PARAMS_SCHEMA extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  RESULT = unknown,
> = IServiceQuery<MODELS, PARAMS_SCHEMA, RESULT> & {
  kind: 'service';
  name: QUERY_NAME;
  serviceName: SERVICE_NAME;
};

export type IAnyServiceQuery = {
  kind: 'service';
  name: string;
  serviceName: string;
  paramsSchema: Schema.Schema.AnyNoContext;
  query: {
    bivarianceHack(props: {
      db: Readonly<Pick<IDb, 'query'>>;
      params: unknown;
    }): Effect.Effect<unknown, IAnyError>;
  }['bivarianceHack'];
};

export type IService<
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
  QUERIES extends Record<string, IAnyServiceQuery> = Record<
    string,
    IAnyServiceQuery
  >,
  FRONTENDS extends Record<string, IAnyServiceFrontendBinding> = Record<
    string,
    IAnyServiceFrontendBinding
  >,
  AUTHORIZE extends IServiceAuthorization<FRONTENDS, MODELS, never> =
    IServiceAuthorization<FRONTENDS, MODELS, never>,
> = {
  name: NAME;
  models: MODELS;
  contracts: CONTRACTS;
  mutationAdapters: MUTATION_ADAPTERS | undefined;
  queries: QUERIES;
  frontends: FRONTENDS;
  makeCommand: <CONTRACT_NAME extends keyof CONTRACTS & string>(props: {
    contractName: CONTRACT_NAME;
    payload: InferPayloadInput<CONTRACTS[CONTRACT_NAME]['payload']>;
  }) => Effect.Effect<
    IServiceCommand<
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

export type IAnyService = {
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
  queries: Record<string, IAnyServiceQuery>;
  frontends: Record<string, IAnyServiceFrontendBinding>;
  authorize?: {
    bivarianceHack(props: unknown): Effect.Effect<void, IAnyError, never>;
  }['bivarianceHack'];
  makeCommand: (props: never) => Effect.Effect<unknown, IAnyError, CuidFactory>;
};

export type IServices = Record<string, IAnyService>;
