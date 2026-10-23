import { Schema } from "effect";
import type { VisibilityCondition } from "@json-render/core";

const comparisonFields = {
  eq: Schema.optionalKey(Schema.Unknown),
  neq: Schema.optionalKey(Schema.Unknown),
  gt: Schema.optionalKey(Schema.Union([Schema.Number, Schema.Struct({ $state: Schema.String })])),
  gte: Schema.optionalKey(Schema.Union([Schema.Number, Schema.Struct({ $state: Schema.String })])),
  lt: Schema.optionalKey(Schema.Union([Schema.Number, Schema.Struct({ $state: Schema.String })])),
  lte: Schema.optionalKey(Schema.Union([Schema.Number, Schema.Struct({ $state: Schema.String })])),
  not: Schema.optionalKey(Schema.Literal(true)),
};
const singleConditionSchema = Schema.Union([
  Schema.Struct({ $state: Schema.String, ...comparisonFields }),
  Schema.Struct({ $item: Schema.String, ...comparisonFields }),
  Schema.Struct({ $index: Schema.Literal(true), ...comparisonFields }),
]);
const visibilityConditionSchema: Schema.Codec<VisibilityCondition> = Schema.suspend(() =>
  Schema.Union([
    Schema.Boolean,
    singleConditionSchema,
    Schema.mutable(Schema.Array(singleConditionSchema)),
    Schema.Struct({ $and: Schema.mutable(Schema.Array(visibilityConditionSchema)) }),
    Schema.Struct({ $or: Schema.mutable(Schema.Array(visibilityConditionSchema)) }),
  ]),
).annotate({ identifier: "PlacementSpecVisibilityConditionV1" });
const actionInvocationFields = {
  action: Schema.String,
  params: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
};
const actionBindingSchema = Schema.Struct({
  ...actionInvocationFields,
  confirm: Schema.optionalKey(
    Schema.Struct({
      title: Schema.String,
      message: Schema.String,
      confirmLabel: Schema.optionalKey(Schema.String),
      cancelLabel: Schema.optionalKey(Schema.String),
      variant: Schema.optionalKey(Schema.Literals(["default", "danger"])),
    }),
  ),
  onSuccess: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ navigate: Schema.String }),
      Schema.Struct({ set: Schema.Record(Schema.String, Schema.Unknown) }),
      Schema.Struct(actionInvocationFields),
    ]),
  ),
  onError: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ set: Schema.Record(Schema.String, Schema.Unknown) }),
      Schema.Struct(actionInvocationFields),
    ]),
  ),
  preventDefault: Schema.optionalKey(Schema.Boolean),
});
const actionBindingsSchema = Schema.Record(
  Schema.String,
  Schema.Union([actionBindingSchema, Schema.mutable(Schema.Array(actionBindingSchema))]),
);

/** Validate the stored Spec structure for the current placement model. */
export const placementSpecSchema = Schema.Struct({
  root: Schema.NonEmptyString,
  elements: Schema.Record(
    Schema.String,
    Schema.Struct({
      type: Schema.NonEmptyString,
      props: Schema.Record(Schema.String, Schema.Unknown),
      children: Schema.optionalKey(Schema.mutable(Schema.Array(Schema.String))),
      slots: Schema.optionalKey(
        Schema.Record(Schema.String, Schema.mutable(Schema.Array(Schema.String))),
      ),
      visible: Schema.optionalKey(visibilityConditionSchema),
      on: Schema.optionalKey(actionBindingsSchema),
      repeat: Schema.optionalKey(
        Schema.Struct({
          statePath: Schema.Union([Schema.String, Schema.Struct({ $item: Schema.String })]),
          key: Schema.optionalKey(Schema.String),
        }),
      ),
      watch: Schema.optionalKey(actionBindingsSchema),
    }),
  ).check(Schema.isMinProperties(1)),
  state: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
}).check(
  Schema.makeFilter((spec) => Object.hasOwn(spec.elements, spec.root), {
    message: "Spec root must reference an existing element",
  }),
);
