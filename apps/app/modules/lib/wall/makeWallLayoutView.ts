import type { IInferModelRow } from "@zerospin/core/models/types";
import type { wallLayoutSchema } from "@qrk.sh/zerospin/src/aggregates/user/layout/wallLayoutSchema";
import type { placementV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/placement/PlacementV1";
import type { brickV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/brick/BrickV1";

/** Resolve structural references while preserving the Wall's authoritative array order. */
export function makeWallLayoutView(props: {
  wall: {
    layout: typeof wallLayoutSchema.Type;
    placements: readonly {
      id: IInferModelRow<typeof placementV1>["id"];
      brickId: IInferModelRow<typeof placementV1>["brickId"];
      variantId: IInferModelRow<typeof placementV1>["variantId"];
      spec: IInferModelRow<typeof placementV1>["spec"];
      brick: IInferModelRow<typeof brickV1>;
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
