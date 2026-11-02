import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { placement } from "../models/placement/placement";
import { wallLayoutSchema, sectionIdSchema, stackIdSchema, rowIdSchema } from "./wallLayoutSchema";

// The retained uniqueness check reads only unchanged node IDs and Placement membership.
export const wallLayoutSchemaV2 = wallLayoutSchema.mapFields(
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
