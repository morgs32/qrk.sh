import { resolveBrickLayout } from "@qrk.sh/bricks/modules/freshLibrary";
import type { IInferDecodedRow } from "@zerospin/shapes";
import type { brickV1 } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import type { wallV1 } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";
import type { placementV1 } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";
import type { pageSnapshotSchema } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/pageSnapshotSchema";

export function makePageSnapshotV1(props: {
  preferredRowSizing: boolean;
  preferredStackSizing: boolean;
  page: Pick<typeof pageSnapshotSchema.Type, "slug" | "title" | "description">;
  bricks: readonly IInferDecodedRow<typeof brickV1.table.shape>[];
  walls: readonly IInferDecodedRow<typeof wallV1.table.shape>[];
  placements: readonly IInferDecodedRow<typeof placementV1.table.shape>[];
}): typeof pageSnapshotSchema.Type {
  const { page, bricks, walls, placements, preferredRowSizing, preferredStackSizing } = props;
  const placementsById = new Map(placements.map((entry) => [entry.id, entry]));
  const bricksById = new Map(bricks.map((entry) => [entry.id, entry]));
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
        brickState: entry.state,
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
            ...(!preferredStackSizing || stack.widthWeight === undefined
              ? {}
              : { widthWeight: stack.widthWeight }),
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
                const brick =
                  placement === undefined ? undefined : bricksById.get(placement.brickId);
                if (placement === undefined || placement.wallId !== wall.id || brick === undefined)
                  throw new Error(
                    `Placement ${placementId} does not belong to snapshot Wall ${wall.id}`,
                  );
                return {
                  id: placement.id,
                  brickId: placement.brickId,
                  layoutId: placement.layoutId,
                  placementState: placement.state,
                  widthWeight: placement.widthWeight,
                  spec: resolveBrickLayout({
                    moduleId: brick.moduleId,
                    layoutId: placement.layoutId,
                    brickState: brick.state,
                  }),
                };
              }),
            })),
          })),
        })),
      })),
  };
}
