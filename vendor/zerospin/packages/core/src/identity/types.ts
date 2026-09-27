import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import type { Effect, Schema } from 'effect';

import type { IAnyAggregateActorVersion } from '../aggregateActor/types.ts';
import type { Async } from '../async/Async.ts';
import type { AggregateChainedCommandSchema } from '../contracts/CommandSchema.ts';
import type { IContract } from '../contracts/types.ts';
import type { InferPayloadInput } from '../models/types.ts';

export type IClaimsSchema = Schema.Struct<
  Readonly<Record<string, Schema.Codec<unknown, unknown>>>
>;

export type IServiceAuthentication<
  C extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
  I extends IClaimsSchema = IClaimsSchema,
> =
  | 'none'
  | Readonly<{
      credentialsSchema: C;
      authenticate(props: {
        credentials: C['Type'];
      }): Effect.Effect<I['Type'], IAnyError, Async | CuidFactory>;
    }>;

export type IAggregateAuthentication<
  C extends Schema.Codec<unknown, unknown> = Schema.Codec<unknown, unknown>,
  I extends IClaimsSchema = IClaimsSchema,
> =
  | 'none'
  | Readonly<{
      credentialsSchema: C;
      authenticate(props: {
        credentials: C['Type'];
        executeCommand<CONTRACT extends IContract>(props: {
          aggregateId: string;
          contract: CONTRACT;
          actor: IAnyAggregateActorVersion;
          claims: Readonly<Record<string, unknown>>;
          payload: InferPayloadInput<CONTRACT['payload']>;
        }): Effect.Effect<
          Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
          IAnyError,
          Async | CuidFactory
        >;
      }): Effect.Effect<I['Type'], IAnyError, Async | CuidFactory>;
    }>;

export type ISessionInitialization<
  I extends IClaimsSchema,
  C extends Schema.Codec<unknown, unknown> | undefined,
> =
  C extends Schema.Codec<unknown, unknown>
    ? {
        getCredentials: () => Effect.Effect<C['Type'], IAnyError>;
        claims?: never;
      }
    : { claims: I['Type']; getCredentials?: never };

export type IAdmissionRequest =
  | { claims: unknown; credentials?: never }
  | { credentials: unknown; claims?: never };
