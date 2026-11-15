import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { placement } from "../placement/placement";

export const sectionIdSchema = makeIdSchema({ abbreviation: "sec" });
export const stackIdSchema = makeIdSchema({ abbreviation: "stk" });
export const rowIdSchema = makeIdSchema({ abbreviation: "row" });
export const rowPreferredWidthSchema = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0),
);
export const rowAlignmentSchema = Schema.Literals(["left", "center", "right"]);

export const wallLayoutSchema = Schema.Struct({
  sections: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        id: sectionIdSchema,
        stacks: Schema.mutable(
          Schema.Array(
            Schema.Struct({
              id: stackIdSchema,
              name: Schema.String,
              widthWeight: Schema.optional(
                Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
              ),
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
}).check(
  Schema.makeFilter(
    (layout) => {
      const nodeIds = new Set<string>();
      const placementIds = new Set<string>();
      for (const section of layout.sections) {
        if (nodeIds.has(section.id)) return false;
        nodeIds.add(section.id);
        for (const stack of section.stacks) {
          if (nodeIds.has(stack.id)) return false;
          nodeIds.add(stack.id);
          for (const row of stack.rows) {
            if (nodeIds.has(row.id)) return false;
            nodeIds.add(row.id);
            for (const placementId of row.placementIds) {
              if (placementIds.has(placementId)) return false;
              placementIds.add(placementId);
            }
          }
        }
      }
      return true;
    },
    { message: "Layout node and Placement references must be unique" },
  ),
);
