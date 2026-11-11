import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { placement } from "../models/placement/placement";
import { wallLayoutSchema, sectionIdSchema, stackIdSchema, rowIdSchema } from "./wallLayoutSchema";

// The retained uniqueness check reads only unchanged node IDs and Placement membership.
export const rowPreferredWidthSchema = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0),
);
export const rowAlignmentSchema = Schema.Literals(["left", "center", "right"]);

export const wallLayoutSchemaV3 = wallLayoutSchema.mapFields(
  () => ({
    sections: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          id: sectionIdSchema,
          stacks: Schema.mutable(
            Schema.Array(
              Schema.Struct({
                id: stackIdSchema,
                name: Schema.String,
                rows: Schema.mutable(
                  Schema.Array(
                    Schema.Struct({
                      id: rowIdSchema,
                      minHeight: Schema.NullOr(
                        Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(45)),
                      ),
                      preferredWidth: Schema.optional(rowPreferredWidthSchema),
                      alignment: Schema.optional(rowAlignmentSchema),
                      placementIds: Schema.mutable(Schema.Array(makeIdSchema(placement))),
                    }),
                  ),
                ),
              }),
            ),
          ),
        }),
      ),
    ),
  }),
  { unsafePreserveChecks: true },
);
