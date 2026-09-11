import type { RoutePattern } from '@remix-run/route-pattern';
import type { MatchParams } from '@remix-run/route-pattern/match';
import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/schema';
import type { Effect, Schema } from 'effect';

import type { Async } from '../async/Async.ts';
import type { AggregateChainedCommandSchema } from '../contracts/CommandSchema.ts';
import type { IContract } from '../contracts/types.ts';
import type { InferPayloadInput } from '../models/types.ts';

/** Authentication belongs to an owner version; selection claims identify its shared replica. */
export type IAuthentication<
  SIGNATURE extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  AUTHENTICATION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
  SELECTION extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
  PATTERN extends string = string,
> = Readonly<{
  signatureSchema: SIGNATURE;
  authenticationSchema: AUTHENTICATION;
  selectionSchema: SELECTION &
    (string extends keyof SELECTION['fields']
      ? unknown
      : {
          fields: {
            [K in keyof SELECTION['fields']]: SELECTION['fields'][K] &
              Schema.Codec<string, string> &
              (K extends keyof AUTHENTICATION['Type']
                ? AUTHENTICATION['Type'][K] extends SELECTION['Type'][K &
                    keyof SELECTION['Type']]
                  ? unknown
                  : never
                : never);
          };
        });
  pattern: RoutePattern<PATTERN> &
    (string extends PATTERN
      ? unknown
      : PATTERN extends `${string}${'(' | ')' | '*' | '?' | '#' | '://'}${string}`
        ? never
        : [keyof MatchParams<PATTERN>] extends [keyof SELECTION['Type']]
          ? [keyof SELECTION['Type']] extends [keyof MatchParams<PATTERN>]
            ? unknown
            : never
          : never);
  authenticate(props: {
    signature: Schema.Schema.Type<SIGNATURE>;
    executeCommand<CONTRACT extends IContract>(props: {
      aggregateId: string;
      contract: CONTRACT;
      payload: InferPayloadInput<CONTRACT['payload']>;
    }): Effect.Effect<
      Schema.Schema.Type<typeof AggregateChainedCommandSchema>,
      IAnyError,
      Async | CuidFactory
    >;
  }): Effect.Effect<
    Schema.Schema.Type<AUTHENTICATION>,
    IAnyError,
    Async | CuidFactory
  >;
}>;
