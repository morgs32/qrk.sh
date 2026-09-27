import type { IAnyAutomation } from '../automation/types.ts';
import type { IAnyContracts } from '../contracts/types.ts';
import type { IAnyModels } from '../models/types.ts';

/** A domain factory returns declarations, without creating a runtime owner. */
export type IDeclarationModule<
  MODELS extends IAnyModels = IAnyModels,
  CONTRACTS extends IAnyContracts = IAnyContracts,
  AUTOMATIONS extends Readonly<Record<string, IAnyAutomation>> = Readonly<
    Record<string, IAnyAutomation>
  >,
> = {
  readonly models: MODELS;
  readonly contracts: CONTRACTS;
  readonly automations: AUTOMATIONS;
};

export type IAnyDeclarationModule = IDeclarationModule;

type IKeys<T> = T extends unknown ? keyof T : never;
type IValue<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

/** The effective collection keeps each declaration's exact inferred type. */
export type IComposedDeclarations<
  LOCAL extends Readonly<Record<string, unknown>>,
  MODULES extends Readonly<Record<string, IAnyDeclarationModule>>,
  KIND extends keyof IAnyDeclarationModule,
> = {
  readonly [K in
    | keyof LOCAL
    | IKeys<MODULES[keyof MODULES][KIND]>]: K extends keyof LOCAL
    ? LOCAL[K]
    : IValue<MODULES[keyof MODULES][KIND], K>;
};

/** Dynamic dictionaries are checked at runtime; known keys must be disjoint. */
type IStaticKeys<T> = string extends keyof T ? never : keyof T;
type IModuleDuplicates<
  LOCAL,
  MODULES extends Readonly<Record<string, IAnyDeclarationModule>>,
  KIND extends keyof IAnyDeclarationModule,
  NAME extends keyof MODULES,
> = Extract<
  IStaticKeys<MODULES[NAME][KIND]>,
  | IStaticKeys<LOCAL>
  | {
      [OTHER in Exclude<keyof MODULES, NAME>]: IStaticKeys<
        MODULES[OTHER][KIND]
      >;
    }[Exclude<keyof MODULES, NAME>]
>;
export type IAssertDistinctDeclarations<
  MODELS,
  CONTRACTS,
  AUTOMATIONS,
  MODULES extends Readonly<Record<string, IAnyDeclarationModule>>,
> = {
  [NAME in keyof MODULES]: {
    [KIND in keyof IAnyDeclarationModule]: {
      [KEY in IModuleDuplicates<
        KIND extends 'models'
          ? MODELS
          : KIND extends 'contracts'
            ? CONTRACTS
            : AUTOMATIONS,
        MODULES,
        KIND,
        NAME
      >]: never;
    };
  };
};
