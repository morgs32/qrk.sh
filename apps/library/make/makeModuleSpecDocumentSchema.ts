import { Schema } from "effect";

import type { defineComponent } from "./defineComponent";
import { makeComponentSpecSchema } from "./makeComponentSpecSchema";

/** Full json-render Spec document schema from a module's component set. */
export function makeModuleSpecDocumentSchema(components: {
  readonly [name: string]: ReturnType<typeof defineComponent>;
}) {
  const [firstElementSchema, ...restElementSchemas] = Object.values(components).map((component) =>
    makeComponentSpecSchema(component),
  );
  if (firstElementSchema === undefined) {
    throw new Error("makeModuleSpecDocumentSchema: module must declare at least one component");
  }

  return Schema.Struct({
    root: Schema.String,
    elements: Schema.Record(
      Schema.String,
      Schema.Union([firstElementSchema, ...restElementSchemas]),
    ),
    state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  });
}
