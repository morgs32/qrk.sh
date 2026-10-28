import { findFirst, findMany, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV2 } from "../../models/brick/BrickV2";
import { pageSnapshotV2 } from "../../models/pageSnapshot/PageSnapshotV2";
import { makePageSnapshotV2 } from "../../snapshots/makePageSnapshotV2";
import { publishPageV1 } from "./PublishPageV1";

export const publishPageV2 = upgradeAggregateContractRelease(publishPageV1, {
  version: 2,
  payload: {},
  models: { brick: brickV2, pageSnapshot: pageSnapshotV2 },
  operations: { createPageSnapshot: pageSnapshotV2.operations.create },
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
        content: makePageSnapshotV2({ page, bricks, walls, placements }),
      },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
