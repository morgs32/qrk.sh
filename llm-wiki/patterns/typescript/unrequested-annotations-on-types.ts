/**
 * Do not add unprompted rationale JSDoc on Zerospin package types.
 *
 * @bad Block comment explaining why a type lives in a package when not requested.
 */
export type IAnyDrizzleDatabase = IDb<IDbConfig<IModels, IAnyShapes>>;

declare type IDb<C> = unknown;
declare type IDbConfig<M, S> = unknown;
declare type IModels = Record<string, unknown>;
declare type IAnyShapes = Record<string, unknown>;
