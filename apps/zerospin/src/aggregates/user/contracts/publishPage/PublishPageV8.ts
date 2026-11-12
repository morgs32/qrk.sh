import {
  findFirst,
  findMany,
  upgradeAggregateContractRelease,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { pageSnapshotV8 as pageSnapshot } from "../../models/pageSnapshot/PageSnapshotV8";
import { makePageSnapshotV8 } from "../../snapshots/makePageSnapshotV8";
import { publishPageV7 } from "./PublishPageV7";
import { wallV4 as wall } from "../../models/wall/WallV4";

export const publishPageV8 = upgradeAggregateContractRelease(publishPageV7, {
  version: 8,
  payload: {},
  models: { brick, pageSnapshot, wall },
  operations: { createPageSnapshot: pageSnapshot.operations.create },
  down: Effect.fn("publishPageV8.down")(function* (props) {
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
        content: makePageSnapshotV8({
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
