import { Schema } from "effect";

import type { defineComponent } from "./defineComponent";
import { makeComponentSpecSchema } from "./makeComponentSpecSchema";
import { placementSpecSchema } from "./makePlacementModel";

/** Full checked json-render Spec document schema from a module's component set. */
export function makeModuleSpecDocumentSchema(components: {
  readonly [name: string]: ReturnType<typeof defineComponent>;
}) {
  const [firstElementSchema, ...restElementSchemas] = Object.values(components).map((component) =>
    makeComponentSpecSchema(component),
  );
  if (firstElementSchema === undefined) {
    throw new Error("makeModuleSpecDocumentSchema: module must declare at least one component");
  }
  const elements = Schema.Record(
    Schema.String,
    Schema.Union([firstElementSchema, ...restElementSchemas]),
  );
  return Schema.Struct({
    root: Schema.NonEmptyString,
    elements: elements.check(Schema.isMinProperties(1)),
    state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }).pipe(Schema.decodeTo(placementSpecSchema));
}
