import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { wall } from "../models/wall/wall";

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
