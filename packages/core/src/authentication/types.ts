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
  USER_ID extends string = string,
> = Readonly<{
  version: VERSION;
  signature: SIGNATURE;
  authenticate(props: {
    signature: Schema.Schema.Type<SIGNATURE>;
  }): Effect.Effect<USER_ID, IAnyError>;
  /** Awaited after identity validation, before granting any frontend capability. */
  onAuthentication?:
    | ((props: {
        userId: string;
        /** Binds the verified userId and waits for the selected aggregate's terminal result. */
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
