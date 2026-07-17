export function get<T, K extends readonly string[]>(
  obj: T,
  path: K,
): _DeepReadonly<T, K> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- must use any to index by string key through the path
  let current: any = obj;

  for (const key of path) {
    if (current === null || typeof current !== 'object' || !(key in current)) {
      return undefined as _DeepReadonly<T, K>;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    current = current[key];
  }

  return current as _DeepReadonly<T, K>;
}

type _DeepReadonly<T, K extends readonly string[]> = K extends [
  infer First,
  ...infer Rest,
]
  ? First extends keyof T
    ? Rest extends readonly string[]
      ? _DeepReadonly<T[First], Rest>
      : never
    : undefined
  : T;
