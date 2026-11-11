import { findMany, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV3 as brick } from "../../models/brick/BrickV3";
import { pageSnapshotV5 as pageSnapshot } from "../../models/pageSnapshot/PageSnapshotV5";
import { makePageSnapshotV5 } from "../../snapshots/makePageSnapshotV5";
import { publishSiteV4 } from "./PublishSiteV4";

export const publishSiteV5 = upgradeAggregateContractRelease(publishSiteV4, {
  version: 5,
  payload: {},
  models: { brick, pageSnapshot },
  operations: { createPageSnapshot: pageSnapshot.operations.create },
  down: Effect.fn("publishSiteV5.down")(function* (props) {
    const { payload } = props;
    return payload;
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
          content: makePageSnapshotV5({
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
