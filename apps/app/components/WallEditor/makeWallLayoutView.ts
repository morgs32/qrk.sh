import type { IInferModelRow } from "@zerospin/core/models/types";
import type { wallLayoutSchemaV3 } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallLayoutSchemaV3";
import type { placementV2 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV2";
import type { brickV4 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV4";

/** Resolve structural references while preserving the Wall's authoritative array order. */
export function makeWallLayoutView(props: {
  wall: {
    layout: typeof wallLayoutSchemaV3.Type;
    placements: readonly {
      id: IInferModelRow<typeof placementV2>["id"];
      brickId: IInferModelRow<typeof placementV2>["brickId"];
      variantId: IInferModelRow<typeof placementV2>["variantId"];
      widthWeight: IInferModelRow<typeof placementV2>["widthWeight"];
      spec: IInferModelRow<typeof placementV2>["spec"];
      brick: IInferModelRow<typeof brickV4>;
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
          alignment: row.alignment ?? "left",
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
