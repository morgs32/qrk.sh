import { makeEffectSchema, type IShape } from "@zerospin/schema";
import { Schema } from "effect";
import { mapValues } from "es-toolkit";

const stateRefSchema = Schema.Struct({
  $state: Schema.String,
});

/** Build an Effect element schema from a defineComponent result (literal props + `$state` bindings). */
export function makeComponentSpecSchema<
  const TYPE extends string,
  const PROPS extends IShape,
>(component: {
  type: TYPE;
  props: PROPS;
  slots?: readonly string[];
  description?: string;
}) {
  const propsSchema = makeEffectSchema(component.props);
  const dynamicProps = Schema.Struct(
    mapValues(propsSchema.fields, (fieldSchema, key) => {
      const descriptor = component.props[key as keyof PROPS];
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
    type: Schema.Literal(component.type),
    props: dynamicProps,
    children: Schema.optional(Schema.Array(Schema.String)),
    slots: Schema.optional(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    visible: Schema.optional(Schema.Unknown),
    on: Schema.optional(Schema.Unknown),
    repeat: Schema.optional(Schema.Unknown),
    watch: Schema.optional(Schema.Unknown),
  });
}
