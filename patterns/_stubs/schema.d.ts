declare module 'effect/Schema' {
  export namespace Schema {
    function validate<A>(schema: unknown): (input: unknown) => unknown;
    function UndefinedOr<A>(schema: unknown): unknown;
    function EitherEncoded<A, E>(success: unknown, error: unknown): unknown;
  }
  export const Schema: typeof Schema;
}

declare function makeAbbreviationIdSchema(abbreviation: string): unknown;
declare function mapParseError(props: {
  code: string;
}): (effect: unknown) => unknown;
