import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type { IContracts, IOperationName } from '../contracts/types.ts';
import type { IModels } from '../models/types.ts';

type IAnyServiceQuery = {
  kind: 'service';
  name: string;
  serviceName: string;
  paramsSchema: Schema.Schema.AnyNoContext;
  query: (props: never) => Effect.Effect<unknown, IAnyError>;
};

type IAnyServiceQueries = Record<string, IAnyServiceQuery>;

/** Erased service stored on heterogeneous `IServiceControllers` maps. */
export type IAnyService = {
  name: string;
  version: string;
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
  queries: IAnyServiceQueries;
};

/** Heterogeneous singleton service map on a system. */
export type IServiceControllers = Record<string, IAnyService>;
