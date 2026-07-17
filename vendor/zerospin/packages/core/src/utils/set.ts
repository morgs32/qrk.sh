/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function set(obj: any, path: readonly string[], value: any): any {
  if (path.length === 1) {
    obj[path[0]] = value;

    return obj;
  }

  obj[path[0]] ??= {};
  set(obj[path[0]], path.slice(1), value);

  return obj;
}
