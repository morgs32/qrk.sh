import type { IAnyDeclarationModule } from './types.ts';

/** Check every source before assignment, including identical declarations. */
export function composeDeclarations(
  props: Partial<IAnyDeclarationModule> & {
    modules?: Readonly<Record<string, IAnyDeclarationModule>>;
  },
): IAnyDeclarationModule {
  const models = { ...props.models };
  const contracts = { ...props.contracts };
  const automations = { ...props.automations };
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
    for (const name of Object.keys(module.automations)) {
      if (Object.hasOwn(automations, name)) {
        throw new Error(
          `Duplicate automation declaration ${name} in ${moduleName}`,
        );
      }
    }
    Object.assign(automations, module.automations);
  }
  return { models, contracts, automations };
}
