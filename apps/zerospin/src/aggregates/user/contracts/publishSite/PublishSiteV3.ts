import { upgradeAggregateContractRelease, findMany } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { publishSiteV2 } from "./PublishSiteV2";
import { pageSnapshotV3 } from "../../models/pageSnapshot/PageSnapshotV3";
import { makePageSnapshotV3 } from "../../snapshots/makePageSnapshotV3";

export const publishSiteV3 = upgradeAggregateContractRelease(publishSiteV2, {
  version: 3,
  payload: {},
  models: { wall, placement, pageSnapshot: pageSnapshotV3 },
  operations: { createPageSnapshot: pageSnapshotV3.operations.create },
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
          content: makePageSnapshotV3({ page, bricks, walls, placements }),
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
