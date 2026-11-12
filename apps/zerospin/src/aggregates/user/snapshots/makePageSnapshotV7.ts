import type { IInferDecodedRow } from "@zerospin/shapes";
import type { brickV4 } from "../models/brick/BrickV4";
import type { wallV4 } from "../models/wall/WallV4";
import type { placementV2 } from "../models/placement/PlacementV2";
import type { PageSnapshotSchemaV7 } from "./pageSnapshotSchemaV7";

export function makePageSnapshotV7(props: {
  preferredRowSizing: boolean;
  page: Pick<typeof PageSnapshotSchemaV7.Type, "slug" | "title" | "description">;
  bricks: readonly IInferDecodedRow<typeof brickV4.table.shape>[];
  walls: readonly IInferDecodedRow<typeof wallV4.table.shape>[];
  placements: readonly IInferDecodedRow<typeof placementV2.table.shape>[];
}): typeof PageSnapshotSchemaV7.Type {
  const { page, bricks, walls, placements, preferredRowSizing } = props;
  const placementsById = new Map(placements.map((entry) => [entry.id, entry]));
  const brickIds = new Set(bricks.map((entry) => entry.id));
  const breakpointOrder = ["sm", "md", "lg", "xl"];
  return {
    ...(preferredRowSizing ? { rowSizing: "preferred" } : {}),
    slug: page.slug,
    title: page.title,
    description: page.description,
    bricks: [...bricks]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => ({
        id: entry.id,
        moduleId: entry.moduleId,
        state: entry.state,
        borderWidth: entry.borderWidth,
      })),
    walls: [...walls]
      .sort((a, b) => breakpointOrder.indexOf(a.breakpoint) - breakpointOrder.indexOf(b.breakpoint))
      .map((wall) => ({
        id: wall.id,
        breakpoint: wall.breakpoint,
        sections: wall.layout.sections.map((section) => ({
          id: section.id,
          stacks: section.stacks.map((stack) => ({
            id: stack.id,
            name: stack.name,
            ...(stack.widthWeight === undefined ? {} : { widthWeight: stack.widthWeight }),
            rows: stack.rows.map((row) => ({
              id: row.id,
              minHeight: row.minHeight,
              ...(preferredRowSizing
                ? {
                    ...(row.preferredWidth === undefined
                      ? {}
                      : { preferredWidth: row.preferredWidth }),
                    alignment: row.alignment ?? "left",
                  }
                : {}),
              placements: row.placementIds.map((placementId) => {
                const placement = placementsById.get(placementId);
                if (
                  placement === undefined ||
                  placement.wallId !== wall.id ||
                  !brickIds.has(placement.brickId)
                )
                  throw new Error(
                    `Placement ${placementId} does not belong to snapshot Wall ${wall.id}`,
                  );
                return {
                  id: placement.id,
                  brickId: placement.brickId,
                  variantId: placement.variantId,
                  widthWeight: placement.widthWeight,
                  spec: placement.spec,
                };
              }),
            })),
          })),
        })),
      })),
  };
}
