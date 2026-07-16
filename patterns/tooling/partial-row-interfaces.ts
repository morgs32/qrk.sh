type InferRow<T> = T extends { readonly _row: infer R } ? R : never;

/**
 * Derive row types with `InferRow<typeof shape>` at the use site — no hand-written partial interfaces named `IEncoded*`.
 *
 * @bad `interface IEncodedDeploy { id; deployName; … }` omitting columns still in SQLite.
 * @bad Overloading `IEncoded*` for intentional read-model subsets — use a distinct projection name instead.
 */
const mutationShape = {
  commandId: { kind: 'text' },
  mutationIndex: { kind: 'integer' },
} as const;

declare const tx: {
  insert(table: unknown): { values(row: unknown): unknown };
};

const encodedMutation = {
  commandId: 'cmd_1',
  mutationIndex: 0,
  modelName: 'Order',
  resourceId: 'ord_1',
};

tx.insert({ name: 'mutations' }).values({
  commandId: 'cmd_1',
  mutationIndex: 0,
  ...encodedMutation,
} satisfies InferRow<typeof mutationShape>);

export type IAccountFanoutEvent = Readonly<{
  mutations: readonly InferRow<typeof mutationShape>[];
}>;
