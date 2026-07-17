/**
 * Pure type declarations collect in `src/types.ts`; one file per type is for runtime exports only.
 *
 * @bad `IMergedSchema.ts` exporting a single `export type IMergedSchema = …`.
 * @bad Dedicated type files for plain domain interfaces with no special JSDoc.
 */
export type IDbClient<
  SCHEMA extends Record<string, unknown>,
  RELATIONS extends Record<string, unknown> = Record<string, never>,
> = {
  schema: SCHEMA;
  relations: RELATIONS;
};

export type IMergedSchema<
  MODELS extends Record<string, unknown>,
  SCHEMA extends Record<string, unknown>,
> = SCHEMA & { models: MODELS };
