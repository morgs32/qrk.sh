import { makeModel, makeModelVersion } from "@zerospin/core/models/makeModel";
import { makeEffectSchema, primitives, type IShape } from "@zerospin/schema";

type KebabToCamelCase<S extends string> = S extends `${infer Head}-${infer Rest}`
  ? `${Head}${Capitalize<KebabToCamelCase<Rest>>}`
  : S;

/** Zerospin model version for a library module: shared typed state only. */
export function makeModuleModelVersion<
  MODULE extends string,
  ABBREVIATION extends string,
  const VERSION extends string,
  STATE_SHAPE extends IShape,
>(module: {
  id: MODULE;
  abbreviation: ABBREVIATION;
  version: VERSION;
  stateShape: STATE_SHAPE;
}) {
  const name = module.id.replace(/-([a-z0-9])/g, (_match, char: string) =>
    char.toUpperCase(),
  ) as KebabToCamelCase<MODULE>;
  const model = makeModel({ name, abbreviation: module.abbreviation });

  return makeModelVersion(model, {
    attributes: {
      state: primitives.json({ schema: makeEffectSchema(module.stateShape) }),
    },
    indexes: [],
    version: module.version,
  });
}
