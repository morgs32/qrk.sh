export type IResult<SUCCESS = unknown, FAILURE = unknown> =
  | Readonly<{ _tag: 'Success'; success: SUCCESS }>
  | Readonly<{ _tag: 'Failure'; failure: FAILURE }>;

export type IZerospinError<T extends string = string> =
  import('./ScopedError.js').ZerospinError<T>;

export type IAnyError = IZerospinError<string>;

/** Scoped business failures cannot pass as framework execution failures. */
export type IFrameworkError = IAnyError & { readonly scope?: never };
