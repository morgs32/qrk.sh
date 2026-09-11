import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import type { Effect, JsonSchema, Schema } from 'effect';

import type { Async } from '../async/Async.ts';
import type { AggregateChainedCommandSchema } from '../contracts/CommandSchema.ts';
import type { IAggregateCommand, IEncodedCommand } from '../contracts/types.ts';

export type IAuthentication<
  VERSION extends string = string,
  SIGNATURE extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  IDENTITY_KEY extends string = string,
> = Readonly<{
  version: VERSION;
  signature: SIGNATURE;
  /** Returns the external identity key, independent of any User resource ID. */
  authenticate(props: {
    signature: Schema.Schema.Type<SIGNATURE>;
  }): Effect.Effect<IDENTITY_KEY, IAnyError>;
  /** Awaited after identity validation, before granting any frontend capability. */
  onAuthentication?:
    | ((props: {
        identityKey: string;
        /** Binds the verified identityKey and waits for the selected aggregate's terminal result. */
        executeAggregateCommand(
          command: IEncodedCommand<
            Extract<IAggregateCommand, { sessionId: null }>
          >,
        ): Effect.Effect<
          Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
          IAnyError,
          Async
        >;
      }) => Effect.Effect<void, IAnyError, Async | CuidFactory>)
    | undefined;
  spec: Readonly<{
    version: VERSION;
    signatureJsonSchema: Readonly<{
      dialect: 'draft-2020-12';
      schema: Readonly<JsonSchema.JsonSchema>;
      definitions: Readonly<Record<string, Readonly<JsonSchema.JsonSchema>>>;
    }>;
  }>;
}>;
