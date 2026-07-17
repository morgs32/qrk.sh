type InferRow<T> = T extends { readonly _row: infer R } ? R : never;

interface IExecutedCommand {
  readonly id: string;
}

/**
 * Do not alias `InferRow<typeof shape>` — keep inference next to the shape owner.
 *
 * @bad `export type IAcceptedEntry = IExecutedCommand & { mutations: InferRow<typeof mutationShape>[] }`.
 * @bad `export type IEncodedDeploy = InferRow<typeof deployShape>` — hides which shape owns the row.
 */
const mutationShape = {
  commandId: { kind: 'text' },
  mutationIndex: { kind: 'integer' },
} as const;

export type IBatchPayload = Readonly<{
  executedCommands: readonly IExecutedCommand[];
  mutations: readonly InferRow<typeof mutationShape>[];
}>;
