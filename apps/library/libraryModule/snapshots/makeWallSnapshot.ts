import type { InferDecodedRow } from "@zerospin/shapes";
import type { IContractReadResult } from "@zerospin/core/contracts/make/makeContractReadDb";

import type { libraryModule } from "../libraryModule";
import type { WallSnapshotSchema } from "./wallSnapshotSchema";

export function makeWallSnapshot(props: {
  bricks: readonly Pick<
    InferDecodedRow<typeof libraryModule.models.brick.table.shape>,
    "id" | "moduleId" | "state"
  >[];
  placements: readonly Pick<
    IContractReadResult<typeof libraryModule.models, "placement", {}>,
    "brickId" | "breakpoint" | "spec" | "gridItem" | "isVisible"
  >[];
}): typeof WallSnapshotSchema.Type {
  const { bricks, placements } = props;

  return {
    bricks: [...bricks]
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((brick) => ({
        id: brick.id,
        moduleId: brick.moduleId,
        state: brick.state,
        placements: placements
          .filter((placement) => placement.brickId === brick.id)
          .sort((left, right) =>
            left.breakpoint < right.breakpoint ? -1 : left.breakpoint > right.breakpoint ? 1 : 0,
          )
          .map((placement) => ({
            breakpoint: placement.breakpoint,
            spec: placement.spec,
            gridItem: placement.gridItem,
            isVisible: placement.isVisible,
          })),
      })),
  };
}
