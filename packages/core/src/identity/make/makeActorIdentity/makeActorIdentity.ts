import { type RoutePattern } from '@remix-run/route-pattern';
import type { MatchParams } from '@remix-run/route-pattern/match';
import { sql, type Placeholder } from 'drizzle-orm';
import { Schema } from 'effect';

import type { IIdentitySchema } from '../../types.ts';

import { IdentitySchema } from './IdentitySchema/IdentitySchema.ts';

type IIdentityKeys<A extends IIdentitySchema> = {
  [K in keyof A['fields']]: A['Type'][K & keyof A['Type']] extends string
    ? A['fields'][K]['Encoded'] extends string
      ? K
      : never
    : never;
}[keyof A['fields']];
type IIdentityFields<A extends IIdentitySchema, P extends string> = Pick<
  A['fields'],
  Extract<keyof MatchParams<P>, keyof A['fields']>
>;
export type IActorIdentity<
  A extends IIdentitySchema = IIdentitySchema,
  P extends string = string,
> = {
  readonly identitySchema: A;
  readonly actorSchema: Schema.Struct<IIdentityFields<A, P>>;
  readonly pattern: RoutePattern<P>;
  readonly sql: {
    placeholder<K extends keyof IIdentityFields<A, P> & string>(
      name: K,
    ): Placeholder<K, A['Type'][K]>;
  };
};

/** Derive selection identity and SQL placeholders from the identity schema and route. */
export function makeActorIdentity<
  A extends IIdentitySchema,
  const P extends string,
>(props: {
  schema: A;
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
      schema: IdentitySchema.fields.identitySchema,
      actorPath: IdentitySchema.fields.pattern,
    }),
    { onExcessProperty: 'error' },
  )(input);
  const fields: Record<string, Schema.Codec<unknown, unknown>> = {};
  for (const token of props.actorPath.pathname.tokens) {
    if (token.type !== ':') continue;
    const field = props.schema.fields[token.name];
    if (field === undefined) {
      throw new Error(`Unknown actorPath identity field ${token.name}`);
    }
    fields[token.name] = field;
  }
  const validated = Schema.decodeUnknownSync(IdentitySchema)({
    identitySchema: props.schema,
    actorSchema: Schema.Struct(fields),
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
