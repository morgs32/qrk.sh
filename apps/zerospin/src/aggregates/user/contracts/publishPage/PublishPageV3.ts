import { upgradeAggregateContractRelease, findFirst, findMany } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { publishPageV2 } from "./PublishPageV2";
import { pageSnapshotV3 } from "../../models/pageSnapshot/PageSnapshotV3";
import { makePageSnapshotV3 } from "../../snapshots/makePageSnapshotV3";

export const publishPageV3 = upgradeAggregateContractRelease(publishPageV2, {
  version: 3,
  payload: {},
  models: { wall, placement, pageSnapshot: pageSnapshotV3 },
  operations: { createPageSnapshot: pageSnapshotV3.operations.create },
  program: Effect.fn("publishPage")(function* (props) {
    const { payload, operations, failures, db } = props;
    const page = yield* findFirst({
      db,
      model: db.models.page,
      where: { id: { eq: payload.pageId } },
    });
    if (page === undefined) {
      return yield* failures.publishPageNotFound.make({
        message: `Page ${payload.pageId} was not found`,
        status: 404,
      });
    }
    const bricks = yield* findMany({
      db,
      model: db.models.brick,
      where: { pageId: { eq: page.id } },
    });
    const walls = yield* findMany({
      db,
      model: db.models.wall,
      where: { pageId: { eq: page.id } },
    });
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { wallId: { in: walls.map((entry) => entry.id) } },
    });
    yield* operations.createPageSnapshot({
      resourceId: payload.snapshotId,
      attributes: {
        pageId: page.id,
        content: makePageSnapshotV3({ page, bricks, walls, placements }),
      },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
