import type { IAnyDeclarationModule } from './types.ts';

/** Check every source before assignment, including identical declarations. */
export function composeDeclarations(
  props: Partial<IAnyDeclarationModule> & {
    modules?: Readonly<Record<string, IAnyDeclarationModule>>;
  },
): IAnyDeclarationModule {
  const models = { ...props.models };
  const contracts = { ...props.contracts };
  for (const [moduleName, module] of Object.entries(props.modules ?? {})) {
    for (const name of Object.keys(module.models)) {
      if (Object.hasOwn(models, name)) {
        throw new Error(`Duplicate model declaration ${name} in ${moduleName}`);
      }
    }
    Object.assign(models, module.models);
    for (const name of Object.keys(module.contracts)) {
      if (Object.hasOwn(contracts, name)) {
        throw new Error(
          `Duplicate contract declaration ${name} in ${moduleName}`,
        );
      }
    }
    Object.assign(contracts, module.contracts);
  }
  return { models, contracts };
}
