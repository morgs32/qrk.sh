import type { libraryModule } from "@qrk.sh/library/libraryModule";
import type { IContractReadResult } from "@zerospin/core/contracts/make/makeContractReadDb";
import type { InferDecodedRow } from "@zerospin/shapes";

import type { PageSnapshotSchema } from "./pageSnapshotSchema";

export function makePageSnapshot(props: {
  page: Pick<typeof PageSnapshotSchema.Type, "slug" | "title" | "description">;
  bricks: readonly Pick<
    InferDecodedRow<typeof libraryModule.models.brick.table.shape>,
    "id" | "moduleId" | "state"
  >[];
  placements: readonly Pick<
    IContractReadResult<typeof libraryModule.models, "placement", {}>,
    "brickId" | "breakpoint" | "spec" | "gridItem" | "isVisible"
  >[];
}): typeof PageSnapshotSchema.Type {
  const { page, bricks, placements } = props;

  return {
    slug: page.slug,
    title: page.title,
    description: page.description,
    wall: {
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
    },
  };
}
