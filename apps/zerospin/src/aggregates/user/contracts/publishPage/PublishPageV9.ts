import {
  findFirst,
  findMany,
  upgradeAggregateContractRelease,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV6 as brick } from "../../models/brick/BrickV6";
import { pageSnapshotV9 as pageSnapshot } from "../../models/pageSnapshot/PageSnapshotV9";
import { makePageSnapshotV9 } from "../../snapshots/makePageSnapshotV9";
import { publishPageV8 } from "./PublishPageV8";
import { wallV4 as wall } from "../../models/wall/WallV4";

export const publishPageV9 = upgradeAggregateContractRelease(publishPageV8, {
  version: 9,
  payload: {},
  models: { brick, pageSnapshot, wall },
  operations: { createPageSnapshot: pageSnapshot.operations.create },
  down: Effect.fn("publishPageV9.down")(function* (props) {
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
        content: makePageSnapshotV9({
          page,
          bricks,
          walls,
          placements,
          preferredRowSizing: payload.preferredRowSizing,
          preferredStackSizing: payload.preferredStackSizing,
        }),
      },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
