import { upgradeAggregateContractRelease, findFirst, findMany, primitives } from "@zerospin/sdk/browser";
import { makePageSnapshotV3 } from "../../snapshots/makePageSnapshotV3";
import { Effect } from "effect";
import { wallV3 as wall } from "../../models/wall/WallV3";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { publishPageV3 } from "./PublishPageV3";
import { pageSnapshotV4 } from "../../models/pageSnapshot/PageSnapshotV4";
import { makePageSnapshotV4 } from "../../snapshots/makePageSnapshotV4";

export const publishPageV4 = upgradeAggregateContractRelease(publishPageV3, {
  version: 4,
  payload: { preferredRowSizing: primitives.boolean() },
  up: Effect.fn("publishPageV4.up")(function* (props) {
    const { payload } = props;
    return { ...payload, preferredRowSizing: false };
  }),
  down: Effect.fn("publishPageV4.down")(function* (props) {
    const { payload } = props;
    const { preferredRowSizing, ...legacy } = payload;
    return legacy;
  }),
  models: { wall, placement, pageSnapshot: pageSnapshotV4 },
  operations: { createPageSnapshot: pageSnapshotV4.operations.create },
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
        content: payload.preferredRowSizing
          ? makePageSnapshotV4({ page, bricks, walls, placements })
          : makePageSnapshotV3({ page, bricks, walls, placements }),
      },
    });
    yield* operations.updatePage({
      resourceId: page.id,
      attributes: { isPublished: true, publishedSnapshotId: payload.snapshotId },
    });
  }),
});
