import {
  DownAdapterRefused,
  findFirst,
  findMany,
  primitives,
  upgradeAggregateContractRelease,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { pageSnapshotV7 as pageSnapshot } from "../../models/pageSnapshot/PageSnapshotV7";
import { makePageSnapshotV7 } from "../../snapshots/makePageSnapshotV7";
import { makePageSnapshotV6 } from "../../snapshots/makePageSnapshotV6";
import { publishPageV6 } from "./PublishPageV6";
import { wallV4 as wall } from "../../models/wall/WallV4";

export const publishPageV7 = upgradeAggregateContractRelease(publishPageV6, {
  version: 7,
  payload: { preferredStackSizing: primitives.boolean() },
  models: { brick, pageSnapshot, wall },
  operations: { createPageSnapshot: pageSnapshot.operations.create },
  up: Effect.fn("publishPageV7.up")(function* (props) {
    const { payload } = props;
    return { ...payload, preferredStackSizing: false };
  }),
  down: Effect.fn("publishPageV7.down")(function* (props) {
    const { payload } = props;
    if (payload.preferredStackSizing) return DownAdapterRefused;
    const { preferredStackSizing, ...legacy } = payload;
    return legacy;
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
        content: (payload.preferredStackSizing ? makePageSnapshotV7 : makePageSnapshotV6)({
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
