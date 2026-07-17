import type { IAnyActorController } from '../actorController/types.ts';
import type { IContracts, IOperationName } from '../contracts/types.ts';
import type { IModels } from '../models/types.ts';
import type { Schema } from 'effect';

/** Erased account stored on heterogeneous `IAccountControllers` maps. */
type IAnyAccountController = {
  name: string;
  version: string;
  actorControllers: Record<string, IAnyActorController>;
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
};

/** Heterogeneous account map on a system. */
export type IAccountControllers = Record<string, IAnyAccountController>;
