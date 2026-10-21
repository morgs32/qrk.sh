import { Schema } from "effect";
import type { Spec } from "@json-render/core";

import type { defineComponent } from "./defineComponent";
import { makeComponentSpecSchema } from "./makeComponentSpecSchema";
import { placementSpecSchemaV2, type makePlacementModel } from "./makePlacementModel";

/** Full json-render Spec document schema from a module's component set. */
export function makeModuleSpecDocumentSchema(
  components: { readonly [name: string]: ReturnType<typeof defineComponent> },
  strict: true,
): Schema.Codec<Spec, unknown>;
export function makeModuleSpecDocumentSchema(
  components: { readonly [name: string]: ReturnType<typeof defineComponent> },
  strict?: false,
): ReturnType<typeof makePlacementModel>["attributes"]["spec"]["schema"];
export function makeModuleSpecDocumentSchema(
  components: { readonly [name: string]: ReturnType<typeof defineComponent> },
  strict: boolean,
): Schema.Codec<Spec, unknown> | ReturnType<typeof makePlacementModel>["attributes"]["spec"]["schema"];
export function makeModuleSpecDocumentSchema(
  components: { readonly [name: string]: ReturnType<typeof defineComponent> },
  strict = false,
) {
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
  if (strict) {
    return Schema.Struct({
      root: Schema.NonEmptyString,
      elements: elements.check(Schema.isMinProperties(1)),
      state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    }).pipe(Schema.decodeTo(placementSpecSchemaV2));
  }

  return Schema.Struct({
    root: Schema.String,
    elements,
    state: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  });
}
