/* oxlint-disable no-redeclare -- Effect Schema export names intentionally match JavaScript globals */
declare module 'effect' {
  export namespace Schema {
    function decodeUnknownEffect<A>(
      schema: unknown,
    ): (
      input: unknown,
      options?: { onExcessProperty?: 'ignore' | 'error' },
    ) => unknown;
    function decodeEffect<A>(
      schema: unknown,
    ): (
      input: unknown,
      options?: { onExcessProperty?: 'ignore' | 'error' },
    ) => unknown;
    function encodeEffect<A>(schema: unknown): (input: unknown) => unknown;
    function toType<A>(schema: unknown): unknown;
    function UndefinedOr<A>(schema: unknown): unknown;
    function NullOr<A>(schema: unknown): unknown;
    function Struct(fields: Record<string, unknown>): unknown;
    function Array<A>(schema: unknown): unknown;
    const String: unknown;
    const Unknown: unknown;
    const Date: unknown;
    const DateFromString: unknown;
    function fromJsonString(schema: unknown): unknown;
  }
}

declare function mapParseError(props: {
  code: string;
  prefix: string;
  extra?: unknown;
}): (effect: unknown) => unknown;
