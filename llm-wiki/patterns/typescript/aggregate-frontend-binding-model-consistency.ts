import { isEqual } from 'es-toolkit';

/**
 * Resolve frontend-model keys to aggregate-model keys before checking current projection compatibility.
 *
 * @bad Compare only registry keys; authored model bindings map frontend keys to source keys.
 * @bad Merge aggregate and frontend models into one system-level map to hide drift.
 * @bad Allow equal model names with divergent specs or a projection adapter.
 */
export function validateAggregateFrontendBinding(props: {
  aggregateName: string;
  frontendName: string;
  aggregateModels: Record<string, { modelName: string; spec: unknown }>;
  controllerModels: Record<string, { modelName: string; spec: unknown }>;
  modelBindings: Record<string, string>;
  projectionAdapters: Record<string, unknown>;
}) {
  const usedSourceModelKeys = new Set<string>();

  for (const [frontendModelKey, sourceModelKey] of Object.entries(
    props.modelBindings,
  )) {
    const frontendModel = props.controllerModels[frontendModelKey];
    const sourceModel = props.aggregateModels[sourceModelKey];
    if (frontendModel === undefined || sourceModel === undefined) {
      throw new Error(
        `aggregates.${props.aggregateName}.frontends.${props.frontendName}.models.${frontendModelKey} has an unknown model binding`,
      );
    }
    if (usedSourceModelKeys.has(sourceModelKey)) {
      throw new Error(`aggregate model ${sourceModelKey} is bound twice`);
    }
    usedSourceModelKeys.add(sourceModelKey);

    const namesDiffer = sourceModel.modelName !== frontendModel.modelName;
    const hasProjectionAdapter = frontendModelKey in props.projectionAdapters;

    if (!namesDiffer && !isEqual(sourceModel.spec, frontendModel.spec)) {
      throw new Error('equal model names require exact current specs');
    }
    if (namesDiffer && !hasProjectionAdapter) {
      throw new Error('different model names require a projection adapter');
    }
    if (!namesDiffer && hasProjectionAdapter) {
      throw new Error('equal model names forbid a projection adapter');
    }
  }
}
