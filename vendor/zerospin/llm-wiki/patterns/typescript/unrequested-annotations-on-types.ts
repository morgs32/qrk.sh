/**
 * Do not add unprompted rationale JSDoc on Zerospin package types.
 *
 * @bad Block comment explaining why a type lives in a package when not requested.
 */
export type IAnyDrizzleDatabase = IDb<IDbConfig<IAnyModels, IAnyShapes>>;

declare type IDb<C> = unknown;
declare type IDbConfig<M, S> = unknown;
declare type IAnyModels = Record<string, unknown>;
declare type IAnyShapes = Record<string, unknown>;
