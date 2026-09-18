import { isEqual } from 'es-toolkit';

/**
 * Frontends select exact models from their selected aggregate version.
 * Services use the same exact-subset rule. There are no model mappings or projection adapters.
 * @bad Admit a same-named model with a divergent version or spec.
 * @bad Treat frontendName alone as identifying the admitted model subset.
 */
export function validateAggregateFrontendModels(props: {
  aggregateModels: Readonly<
    Record<string, { modelName: string; spec: unknown }>
  >;
  frontendModels: Readonly<
    Record<string, { modelName: string; spec: unknown }>
  >;
}) {
  for (const [key, model] of Object.entries(props.frontendModels)) {
    const selected = props.aggregateModels[key];
    if (
      selected === undefined ||
      model.modelName !== selected.modelName ||
      !isEqual(model.spec, selected.spec)
    ) {
      throw new Error(
        `Frontend model ${key} must match the selected aggregate model`,
      );
    }
  }
}
