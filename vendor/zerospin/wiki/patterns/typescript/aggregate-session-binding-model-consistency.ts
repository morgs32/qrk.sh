import { isEqual } from 'es-toolkit';

/**
 * Sessions select exact models from their selected aggregate version.
 * Services use the same exact-subset rule. There are no model mappings or projection adapters.
 * @bad Admit a same-named model with a divergent version or spec.
 * @bad Treat sessionName alone as identifying the admitted model subset.
 */
export function validateAggregateSessionModels(props: {
  aggregateModels: Readonly<
    Record<string, { modelName: string; spec: unknown }>
  >;
  sessionModels: Readonly<Record<string, { modelName: string; spec: unknown }>>;
}) {
  for (const [key, model] of Object.entries(props.sessionModels)) {
    const selected = props.aggregateModels[key];
    if (
      selected === undefined ||
      model.modelName !== selected.modelName ||
      !isEqual(model.spec, selected.spec)
    ) {
      throw new Error(
        `Session model ${key} must match the selected aggregate model`,
      );
    }
  }
}
