import { makeIdSchema } from "@zerospin/sdk/browser";
import { wall } from "../models/wall/wall";
import { Schema } from "effect";

/** Stable anchors shared by route input, wall controls, and command boundaries. */
export const wallInsertionTargetSchema = Schema.Union([
  Schema.Struct({
    wallId: makeIdSchema(wall),
    kind: Schema.Literal("row"),
    rowId: Schema.String,
    beforePlacementId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    wallId: makeIdSchema(wall),
    kind: Schema.Literal("stack"),
    stackId: Schema.String,
    beforeRowId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    wallId: makeIdSchema(wall),
    kind: Schema.Literal("section"),
    sectionId: Schema.String,
  }),
  Schema.Struct({
    wallId: makeIdSchema(wall),
    kind: Schema.Literal("wall"),
    beforeSectionId: Schema.NullOr(Schema.String),
  }),
]);

export const stackMoveTargetSchema = Schema.Union([
  Schema.Struct({
    wallId: makeIdSchema(wall),
    kind: Schema.Literal("section"),
    sectionId: Schema.String,
    beforeStackId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    wallId: makeIdSchema(wall),
    kind: Schema.Literal("wall"),
    beforeSectionId: Schema.NullOr(Schema.String),
  }),
]);
