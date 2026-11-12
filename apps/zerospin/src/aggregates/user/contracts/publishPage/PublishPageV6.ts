import { findFirst, findMany, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { pageSnapshotV6 as pageSnapshot } from "../../models/pageSnapshot/PageSnapshotV6";
import { makePageSnapshotV6 } from "../../snapshots/makePageSnapshotV6";
import { publishPageV5 } from "./PublishPageV5";

export const publishPageV6 = upgradeAggregateContractRelease(publishPageV5, {
  version: 6,
  payload: {},
  models: { brick, pageSnapshot },
  operations: { createPageSnapshot: pageSnapshot.operations.create },
  down: Effect.fn("publishPageV6.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
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
        content: makePageSnapshotV6({
          page,
          bricks,
          walls,
          placements,
          preferredRowSizing: payload.preferredRowSizing,
        }),
      },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
