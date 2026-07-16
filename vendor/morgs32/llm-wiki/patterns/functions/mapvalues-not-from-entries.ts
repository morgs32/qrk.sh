declare function mapValues<T extends Record<string, unknown>, U>(
  record: T,
  fn: (value: T[keyof T], key: string) => U,
): Record<string, U>;

/**
 * Transform records with mapValues instead of Object.entries chains.
 *
 * @bad `Object.fromEntries(Object.entries(...).map(...))` when keys are unchanged.
 */
export function buildControllerSpec(props: {
  models: Record<string, { spec: object; actor?: boolean }>;
  contracts: Record<string, { spec: object }>;
  actor: string;
}) {
  const { models, contracts, actor } = props;
  return {
    models: mapValues(models, (model, modelKey) => ({
      ...model.spec,
      actor: modelKey === actor,
    })),
    contracts: mapValues(contracts, contract => contract.spec),
  };
}
