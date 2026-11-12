import {
  DownAdapterRefused,
  findMany,
  primitives,
  upgradeAggregateContractRelease,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV4 as brick } from "../../models/brick/BrickV4";
import { pageSnapshotV7 as pageSnapshot } from "../../models/pageSnapshot/PageSnapshotV7";
import { makePageSnapshotV7 } from "../../snapshots/makePageSnapshotV7";
import { makePageSnapshotV6 } from "../../snapshots/makePageSnapshotV6";
import { publishSiteV6 } from "./PublishSiteV6";
import { wallV4 as wall } from "../../models/wall/WallV4";

export const publishSiteV7 = upgradeAggregateContractRelease(publishSiteV6, {
  version: 7,
  payload: { preferredStackSizing: primitives.boolean() },
  models: { brick, pageSnapshot, wall },
  operations: { createPageSnapshot: pageSnapshot.operations.create },
  up: Effect.fn("publishSiteV7.up")(function* (props) {
    const { payload } = props;
    return { ...payload, preferredStackSizing: false };
  }),
  down: Effect.fn("publishSiteV7.down")(function* (props) {
    const { payload } = props;
    if (payload.preferredStackSizing) return DownAdapterRefused;
    const { preferredStackSizing, ...legacy } = payload;
    return legacy;
  }),
  program: Effect.fn("publishSite")(function* (props) {
    const { payload, operations, db } = props;
    const sitePages = yield* findMany({
      db,
      model: db.models.page,
      where: { siteId: { eq: payload.siteId } },
    });
    for (const page of sitePages) {
      const selection = payload.pages.find((selection) => selection.pageId === page.id);
      if (selection === undefined) {
        yield* operations.updatePage({ resourceId: page.id, attributes: { isPublished: false } });
        continue;
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
        resourceId: selection.snapshotId,
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
        attributes: { isPublished: true, publishedSnapshotId: selection.snapshotId },
      });
    }
    yield* operations.updateSite({ resourceId: payload.siteId, attributes: { isPublished: true } });
  }),
});
