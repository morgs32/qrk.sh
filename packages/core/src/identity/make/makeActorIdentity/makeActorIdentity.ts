import { type RoutePattern } from '@remix-run/route-pattern';
import type { MatchParams } from '@remix-run/route-pattern/match';
import { sql, type Placeholder } from 'drizzle-orm';
import { Schema } from 'effect';

import type { IClaimsSchema } from '../../types.ts';

import { IdentitySchema } from './IdentitySchema/IdentitySchema.ts';

type IIdentityKeys<A extends IClaimsSchema> = {
  [K in keyof A['fields']]: A['Type'][K & keyof A['Type']] extends string
    ? A['fields'][K]['Encoded'] extends string
      ? K
      : never
    : never;
}[keyof A['fields']];
type IIdentityFields<A extends IClaimsSchema, P extends string> = Pick<
  A['fields'],
  Extract<keyof MatchParams<P>, keyof A['fields']>
>;
export type IActorIdentity<
  A extends IClaimsSchema = IClaimsSchema,
  P extends string = string,
> = {
  readonly claimsSchema: A;
  readonly identitySchema: Schema.Struct<IIdentityFields<A, P>>;
  readonly pattern: RoutePattern<P>;
  readonly sql: {
    placeholder<K extends keyof IIdentityFields<A, P> & string>(
      name: K,
    ): Placeholder<K, A['Type'][K]>;
  };
};

/** Derive selection identity and SQL placeholders from the identity claims and route. */
export function makeActorIdentity<
  A extends IClaimsSchema,
  const P extends string,
>(props: {
  claims: A;
  actorPath: RoutePattern<P> &
    (string extends P ? never : unknown) &
    (P extends `${string}${'(' | ')' | '*' | '?' | '#' | '://'}${string}`
      ? never
      : unknown) &
    ([keyof MatchParams<P>] extends [IIdentityKeys<A>] ? unknown : never);
}): IActorIdentity<A, P>;
export function makeActorIdentity(input: unknown): unknown {
  const props = Schema.decodeUnknownSync(
    Schema.Struct({
      claims: IdentitySchema.fields.claimsSchema,
      actorPath: IdentitySchema.fields.pattern,
    }),
    { onExcessProperty: 'error' },
  )(input);
  const fields: Record<string, Schema.Codec<unknown, unknown>> = {};
  for (const token of props.actorPath.pathname.tokens) {
    if (token.type !== ':') continue;
    const field = props.claims.fields[token.name];
    if (field === undefined) {
      throw new Error(`Unknown actorPath identity field ${token.name}`);
    }
    fields[token.name] = field;
  }
  const validated = Schema.decodeUnknownSync(IdentitySchema)({
    claimsSchema: props.claims,
    identitySchema: Schema.Struct(fields),
    pattern: props.actorPath,
  });
  return Object.freeze({
    ...validated,
    sql: Object.freeze({
      placeholder(name: string) {
        if (!Object.hasOwn(fields, name)) {
          throw new Error(
            `Selection parameter ${name} is not an actorPath field`,
          );
        }
        return sql.placeholder(name);
      },
    }),
  });
}
