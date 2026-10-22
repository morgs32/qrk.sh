import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { placement } from "../models/placement/placement";

export const sectionIdSchema = makeIdSchema({ abbreviation: "sec" });
export const stackIdSchema = makeIdSchema({ abbreviation: "stk" });
export const rowIdSchema = makeIdSchema({ abbreviation: "row" });

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
              rows: Schema.mutable(
                Schema.Array(
                  Schema.Struct({
                    id: rowIdSchema,
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
