import { makeEffectSchema, type IShape } from "@zerospin/shapes";
import { Schema } from "effect";
import { mapValues } from "es-toolkit";

const stateRefSchema = Schema.Struct({
  $state: Schema.String,
});

/** Build an Effect element schema from component metadata (literal props + `$state` bindings). */
export function makeComponentSpecSchema<
  const TYPE extends string,
  const PROPS_SHAPE extends IShape,
>(componentMetadata: {
  type: TYPE;
  propsShape: PROPS_SHAPE;
  slots?: readonly string[];
  description?: string;
}) {
  const propsSchema = makeEffectSchema(componentMetadata.propsShape);
  const dynamicProps = Schema.Struct(
    mapValues(propsSchema.fields, (fieldSchema, key) => {
      const descriptor = componentMetadata.propsShape[key as keyof PROPS_SHAPE];
      const dynamicField = Schema.Union([fieldSchema, stateRefSchema]);
      if (
        descriptor !== undefined &&
        typeof descriptor === "object" &&
        "nullable" in descriptor &&
        descriptor.nullable === true
      ) {
        return Schema.optional(dynamicField);
      }
      return dynamicField;
    }),
  );

  return Schema.Struct({
    type: Schema.Literal(componentMetadata.type),
    props: dynamicProps,
    children: Schema.optional(Schema.Array(Schema.String)),
    slots: Schema.optional(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    visible: Schema.optional(Schema.Unknown),
    on: Schema.optional(Schema.Unknown),
    repeat: Schema.optional(Schema.Unknown),
    watch: Schema.optional(Schema.Unknown),
  });
}
