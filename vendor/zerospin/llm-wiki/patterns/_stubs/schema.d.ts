declare module 'effect/Schema' {
  export namespace Schema {
    function validate<A>(
      schema: unknown,
    ): (
      input: unknown,
      options?: { onExcessProperty?: 'ignore' | 'error' },
    ) => unknown;
    function decodeUnknown<A>(
      schema: unknown,
    ): (
      input: unknown,
      options?: { onExcessProperty?: 'ignore' | 'error' },
    ) => unknown;
    function decode<A>(schema: unknown): (input: unknown) => unknown;
    function encode<A>(schema: unknown): (input: unknown) => unknown;
    function UndefinedOr<A>(schema: unknown): unknown;
    function NullOr<A>(schema: unknown): unknown;
    function transform<A, B>(from: unknown, to: unknown, ops: unknown): unknown;
    function Struct(fields: Record<string, unknown>): unknown;
    function Array<A>(schema: unknown): unknown;
    const String: unknown;
    const Unknown: unknown;
    const Date: unknown;
    function parseJson(schema: unknown): unknown;
  }
  export const Schema: typeof Schema;
}

declare function makeAbbreviationIdSchema(abbreviation: string): unknown;
declare function mapParseError(props: {
  code: string;
  prefix: string;
  extra?: unknown;
}): (effect: unknown) => unknown;

declare const coreAbbreviations: {
  actorDeltaCursor: string;
  accountCursor: string;
  sessionCursor: string;
};

declare function makeCursor(props: { abbreviation: string }): unknown;
