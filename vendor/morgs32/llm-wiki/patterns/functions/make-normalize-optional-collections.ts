/**
 * make* constructors normalize optional collections to stable empty defaults.
 *
 * @bad Return `{ shape }` when indexes is undefined and `{ shape, indexes }` otherwise.
 */
export function makeTable<SHAPE>(props: {
  shape: SHAPE;
  indexes?: readonly { columns: readonly string[] }[];
}) {
  const { shape, indexes = [] } = props;
  return { shape, indexes };
}
