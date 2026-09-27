import { Data, Schema, SchemaGetter } from 'effect';

export type IErrorExtra = Readonly<Record<string, unknown>> | null;
type IErrorProps<CODE extends string> = {
  code: CODE;
  message?: string;
  status?: number | null;
  cause?: string | null;
  extra?: unknown;
};

export class ZerospinError<CODE extends string = string> extends Data.Error<{
  readonly _tag: 'ZerospinError';
  readonly code: CODE;
  readonly message: string;
  readonly status: number | null;
  readonly cause: string | null;
  readonly extra: unknown;
}> {
  constructor(props: IErrorProps<CODE>) {
    super({
      _tag: 'ZerospinError',
      code: props.code,
      message: props.message ?? props.code,
      status: props.status ?? null,
      cause: props.cause ?? null,
      extra: props.extra ?? null,
    });
  }
}

type IScopedProps<
  CODE extends string,
  EXTRA extends IErrorExtra,
> = IErrorProps<CODE> & { extra: EXTRA };

export class ContractError<
  CODE extends string,
  EXTRA extends IErrorExtra,
> extends ZerospinError<CODE> {
  readonly scope = 'contract';
  override readonly extra: EXTRA;

  constructor(props: IScopedProps<CODE, EXTRA>) {
    super(props);
    this.extra = props.extra;
  }

  static schema<const CODE extends string>(props: {
    code: CODE;
    extra?: typeof Schema.Null;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      typeof Schema.Null,
      'contract',
      ContractError<CODE, null>
    >
  >;
  static schema<
    const CODE extends string,
    EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  >(props: {
    code: CODE;
    extra: EXTRA;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      EXTRA,
      'contract',
      ContractError<CODE, EXTRA['Type']>
    >
  >;
  static schema(props: {
    code: string;
    extra?: Schema.Codec<IErrorExtra, unknown>;
  }): unknown {
    return makeScopedSchema(
      { code: props.code, extra: props.extra ?? Schema.Null },
      'contract',
      input => new ContractError(input),
    );
  }
}

export class ActorError<
  CODE extends string,
  EXTRA extends IErrorExtra,
> extends ZerospinError<CODE> {
  readonly scope = 'actor';
  override readonly extra: EXTRA;

  constructor(props: IScopedProps<CODE, EXTRA>) {
    super(props);
    this.extra = props.extra;
  }

  static schema<const CODE extends string>(props: {
    code: CODE;
    extra?: typeof Schema.Null;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      typeof Schema.Null,
      'actor',
      ActorError<CODE, null>
    >
  >;
  static schema<
    const CODE extends string,
    EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  >(props: {
    code: CODE;
    extra: EXTRA;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      EXTRA,
      'actor',
      ActorError<CODE, EXTRA['Type']>
    >
  >;
  static schema(props: {
    code: string;
    extra?: Schema.Codec<IErrorExtra, unknown>;
  }): unknown {
    return makeScopedSchema(
      { code: props.code, extra: props.extra ?? Schema.Null },
      'actor',
      input => new ActorError(input),
    );
  }
}

export class AggregateError<
  CODE extends string,
  EXTRA extends IErrorExtra,
> extends ZerospinError<CODE> {
  readonly scope = 'aggregate';
  override readonly extra: EXTRA;

  constructor(props: IScopedProps<CODE, EXTRA>) {
    super(props);
    this.extra = props.extra;
  }

  static schema<const CODE extends string>(props: {
    code: CODE;
    extra?: typeof Schema.Null;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      typeof Schema.Null,
      'aggregate',
      AggregateError<CODE, null>
    >
  >;
  static schema<
    const CODE extends string,
    EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  >(props: {
    code: CODE;
    extra: EXTRA;
  }): ReturnType<
    typeof makeScopedSchema<
      CODE,
      EXTRA,
      'aggregate',
      AggregateError<CODE, EXTRA['Type']>
    >
  >;
  static schema(props: {
    code: string;
    extra?: Schema.Codec<IErrorExtra, unknown>;
  }): unknown {
    return makeScopedSchema(
      { code: props.code, extra: props.extra ?? Schema.Null },
      'aggregate',
      input => new AggregateError(input),
    );
  }
}

export type IScopedError =
  | ContractError<string, IErrorExtra>
  | ActorError<string, IErrorExtra>
  | AggregateError<string, IErrorExtra>;

function makeScopedSchema<
  const CODE extends string,
  EXTRA extends Schema.Codec<IErrorExtra, unknown>,
  const SCOPE extends IScopedError['scope'],
  ERROR extends ZerospinError<CODE> & {
    readonly scope: SCOPE;
    readonly extra: EXTRA['Type'];
  },
>(
  props: { code: CODE; extra: EXTRA },
  scope: SCOPE,
  construct: (props: IScopedProps<CODE, EXTRA['Type']>) => ERROR,
) {
  const extraCodec: Schema.Codec<EXTRA['Type'], EXTRA['Encoded']> = props.extra;
  const wire = Schema.Struct({
    _tag: Schema.Literal('ZerospinError'),
    code: Schema.Literal(props.code),
    scope: Schema.Literal(scope),
    message: Schema.String,
    status: Schema.NullOr(Schema.Number),
    extra: extraCodec,
  });
  type Json = typeof wire.Encoded;
  type Runtime = ERROR & { toJson(): Json };
  function make(
    ...args: [EXTRA['Type']] extends [null]
      ? [input?: Omit<IErrorProps<CODE>, 'code' | 'extra'> & { extra?: null }]
      : [input: Omit<IScopedProps<CODE, EXTRA['Type']>, 'code'>]
  ): Runtime;
  function make(input?: Omit<IErrorProps<CODE>, 'code'>): Runtime {
    return constructRuntime(input ?? {});
  }
  function constructRuntime(input: Omit<IErrorProps<CODE>, 'code'>): Runtime {
    const extra = Schema.decodeUnknownSync(Schema.toType(props.extra))(
      input.extra === undefined && props.extra === Schema.Null
        ? null
        : input.extra,
    );
    const error = construct({ ...input, code: props.code, extra });
    return Object.assign(error, {
      toJson: (): Json =>
        Schema.encodeSync(wire)({
          _tag: 'ZerospinError',
          code: error.code,
          scope,
          message: error.message,
          status: error.status,
          extra: error.extra,
        }),
    });
  }
  const runtime = Schema.declare<Runtime>(
    (value): value is Runtime =>
      value instanceof ZerospinError &&
      'scope' in value &&
      value.scope === scope &&
      value.code === props.code &&
      Schema.is(Schema.toType(props.extra))(value.extra) &&
      'toJson' in value &&
      typeof value.toJson === 'function',
  );
  const codec = wire.pipe(
    Schema.decodeTo(runtime, {
      decode: SchemaGetter.transform(value => constructRuntime(value)),
      encode: SchemaGetter.transform(value => ({
        _tag: 'ZerospinError' as const,
        code: value.code,
        scope,
        message: value.message,
        status: value.status,
        extra: value.extra,
      })),
    }),
  );
  return Object.assign(codec, { make });
}
