import { Schema } from "effect";

import type { defineComponentMetadata } from "./defineComponentMetadata";
import { makeComponentSpecSchema } from "./makeComponentSpecSchema";
import { placementSpecSchema } from "./placementSpecSchema";

/** Full checked json-render Spec document schema from a module's component metadata. */
export function makeModuleSpecDocumentSchema(componentMetadata: {
  readonly [name: string]: ReturnType<typeof defineComponentMetadata>;
}) {
  const [firstElementSchema, ...restElementSchemas] = Object.values(componentMetadata).map(
    (metadata) => makeComponentSpecSchema(metadata),
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
