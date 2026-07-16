/**
 * Class methods with a single props object destructure once at the top.
 *
 * @bad Thread `props.id`, `props.systemId` through multi-line transaction bodies.
 */
export class PairRepo {
  db = {
    transaction: (fn: (tx: Tx) => void) =>
      fn({ insert: () => ({ values: () => ({ run: () => {} }) }) }),
  };
}

type Row = { id: string };
type Tx = {
  insert: (t: unknown) => { values: (row: Row) => { run: () => void } };
};
const t = {} as unknown;
const pair = {} as unknown;

export async function insertPair(props: {
  id: string;
  systemId: string;
  a: Row;
  b: Row;
}) {
  const { id, systemId, a, b } = props;
  new PairRepo().db.transaction(tx => {
    tx.insert(t).values(a).run();
    tx.insert(t).values(b).run();
    tx.insert(pair).values({ id, systemId }).run();
  });
}
