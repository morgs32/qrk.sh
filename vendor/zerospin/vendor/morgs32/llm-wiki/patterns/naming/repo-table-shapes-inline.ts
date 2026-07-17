/**
 * Table shapes used by only one repo belong inline next to `*RepoTables`, not in a sibling file.
 *
 * @bad Do not put `orderCommandShape` in a dedicated file imported solely from `orderRepoTables.ts`.
 * @bad Do not export a shape const when nothing outside the repo module needs it.
 * @bad Do not export a derived Drizzle-schema record when database configuration consumes the table graph.
 */
type IShape = Record<string, unknown>;

declare function makeTable(props: {
  name: string;
  shape: IShape;
  indexes: readonly unknown[];
}): unknown;

const orderCommandShape = {
  id: { kind: 'primaryKey' },
  commandName: { kind: 'text' },
  payload: { kind: 'text' },
} satisfies IShape;

export const orderRepoTables = {
  commands: makeTable({
    name: 'commands',
    shape: orderCommandShape,
    indexes: [],
  }),
} satisfies Record<string, unknown>;
