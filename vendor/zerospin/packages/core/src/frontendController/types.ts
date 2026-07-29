import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type {
  IContracts,
  IContractSpec,
  InferCommand,
  IUnstagedCommand,
} from '../contracts/types.ts';
import type { IGuards } from '../guards/types.ts';
import type { IModels, InferPayloadInput } from '../models/types.ts';
import type { CuidFactory } from '../services/CuidFactory.ts';
import type { ISessionId } from '../session/types.ts';

export type InferFrontendModels<FRONTEND extends IFrontendController> =
  FRONTEND['models'];

export type IFrontendController<
  SYSTEM_NAME extends string = string,
  ACTOR_NAME extends string = string,
  CONTRACTS extends IContracts = IContracts,
  MODELS extends IModels = IModels,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext =
    Schema.Schema.AnyNoContext,
  VERSION extends string = string,
  FRONTEND_NAME extends string = string,
> = {
  accountName: string;
  actorName: ACTOR_NAME;
  frontendName: FRONTEND_NAME;
  version: VERSION;
  contracts: CONTRACTS;
  systemName: SYSTEM_NAME;
  models: MODELS;
  /** Keys from `models` (frontend DB scope). */
  modelNames: readonly string[];
  guards: IGuards<CONTRACTS>;
  signature: SIGNATURE_SCHEMA;
  makeUnstagedCommand: <K extends keyof CONTRACTS & string>(props: {
    commandName: K;
    accountId: string;
    actorId: string;
    sessionId: ISessionId;
    systemVersion: string;
    payload: InferPayloadInput<CONTRACTS[K]['payload']>;
  }) => Effect.Effect<
    IUnstagedCommand<InferCommand<CONTRACTS[K]>>,
    IAnyError,
    CuidFactory
  >;
};

export type IFrontendControllerSpec = {
  accountName: string;
  actorName: string;
  frontendName: string;
  name: string;
  version: string;
  modelNames: readonly string[];
  models: Record<
    string,
    {
      modelName: string;
      abbreviation: string;
      version: string;
      properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      indexes: readonly {
        name: string;
        columns: readonly string[];
        unique?: boolean;
      }[];
      historicalDefinitions: readonly {
        modelName: string;
        abbreviation: string;
        version: string;
        properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
        indexes: readonly {
          name: string;
          columns: readonly string[];
          unique?: boolean;
        }[];
      }[];
    }
  >;
  contracts: Record<string, IContractSpec>;
  signatureJsonSchema: unknown;
};
