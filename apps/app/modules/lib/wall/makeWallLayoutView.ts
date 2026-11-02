import type { IInferModelRow } from "@zerospin/core/models/types";
import type { wallLayoutSchemaV2 } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallLayoutSchemaV2";
import type { placementV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import type { brickV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV2";

/** Resolve structural references while preserving the Wall's authoritative array order. */
export function makeWallLayoutView(props: {
  wall: {
    layout: typeof wallLayoutSchemaV2.Type;
    placements: readonly {
      id: IInferModelRow<typeof placementV2>["id"];
      brickId: IInferModelRow<typeof placementV2>["brickId"];
      variantId: IInferModelRow<typeof placementV2>["variantId"];
      widthWeight: IInferModelRow<typeof placementV2>["widthWeight"];
      spec: IInferModelRow<typeof placementV2>["spec"];
      brick: IInferModelRow<typeof brickV2>;
    }[];
  };
}) {
  const { wall } = props;
  const placements = new Map(wall.placements.map((placement) => [placement.id, placement]));
  return {
    sections: wall.layout.sections.map((section) => ({
      id: section.id,
      stacks: section.stacks.map((stack) => ({
        id: stack.id,
        name: stack.name,
        rows: stack.rows.map((row) => ({
          id: row.id,
          minHeight: row.minHeight,
          placements: row.placementIds.map((id) => {
            const placement = placements.get(id);
            if (placement === undefined)
              throw new Error(`Wall layout references missing Placement ${id}`);
            return placement;
          }),
        })),
      })),
    })),
  };
}
