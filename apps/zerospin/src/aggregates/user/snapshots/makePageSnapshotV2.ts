import type { IInferDecodedRow } from "@zerospin/shapes";
import type { brickV2 } from "../models/brick/BrickV2";
import type { wallV1 } from "../models/wall/WallV1";
import type { placementV1 } from "../models/placement/PlacementV1";
import type { PageSnapshotSchemaV2 } from "./pageSnapshotSchemaV2";

export function makePageSnapshotV2(props: {
  page: Pick<typeof PageSnapshotSchemaV2.Type, "slug" | "title" | "description">;
  bricks: readonly IInferDecodedRow<typeof brickV2.table.shape>[];
  walls: readonly IInferDecodedRow<typeof wallV1.table.shape>[];
  placements: readonly IInferDecodedRow<typeof placementV1.table.shape>[];
}): typeof PageSnapshotSchemaV2.Type {
  const { page, bricks, walls, placements } = props;
  const placementsById = new Map(placements.map((entry) => [entry.id, entry]));
  const brickIds = new Set(bricks.map((entry) => entry.id));
  const breakpointOrder = ["sm", "md", "lg", "xl"];
  return {
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
            rows: stack.rows.map((row) => ({
              id: row.id,
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
                  spec: placement.spec,
                };
              }),
            })),
          })),
        })),
      })),
  };
}
