declare class DomainError extends Error {
  readonly code: string;
  readonly cause: unknown;
  static prettyUnknownFailure(cause: unknown): string;
  pipe<R>(...ops: Array<(effect: unknown) => unknown>): R;
}

declare function decodeRpc<T>(
  encoded: unknown,
): import('effect').Effect.Effect<T, DomainError>;
declare function encodeRpc(effect: unknown): unknown;

declare function getByKeyOrThrow<K extends string, V>(props: {
  record: Record<K, V>;
  key: K;
  recordKind: string;
}): import('effect').Effect.Effect<V, DomainError>;

declare function validateParamsSync<T>(props: {
  schema: unknown;
  value: unknown;
}): T;

declare class RoutePattern {
  constructor(pattern: string);
  test(url: URL): boolean;
  href(params: Record<string, string>): string;
}

declare function encodeRight<T>(value: T): unknown;
