import { makeModelVersion } from "@zerospin/core/models/makeModel";
import { makeEffectSchema, primitives, type IShape } from "@zerospin/schema";
import { Schema } from "effect";

import type { defineComponent } from "./defineComponent";
import { makeComponentSpecSchema } from "./makeComponentSpecSchema";

/** Zerospin model version for a library module: shared state plus per-breakpoint Spec columns. */
export function makeModuleModelVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  const VERSION extends string,
  STATE_SHAPE extends IShape,
>(
  model: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  module: {
    version: VERSION;
    stateShape: STATE_SHAPE;
    components: Record<string, ReturnType<typeof defineComponent>>;
  },
) {
  const [firstElementSchema, ...restElementSchemas] = Object.values(module.components).map(
    component => makeComponentSpecSchema(component),
  );
  if (firstElementSchema === undefined) {
    throw new Error(
      `makeModuleModelVersion: ${JSON.stringify(model.name)} must declare at least one component`,
    );
  }

  const specJson = primitives.json({
    schema: Schema.Struct({
      root: Schema.String,
      elements: Schema.Record(
        Schema.String,
        Schema.Union([firstElementSchema, ...restElementSchemas]),
      ),
      state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    }),
  });

  return makeModelVersion(model, {
    attributes: {
      state: primitives.json({ schema: makeEffectSchema(module.stateShape) }),
      sm: specJson,
      md: specJson,
      lg: specJson,
      xl: specJson,
    },
    indexes: [],
    version: module.version,
  });
}
