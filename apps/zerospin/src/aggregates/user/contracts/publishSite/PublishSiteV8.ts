import {
  findMany,
  upgradeAggregateContractRelease,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV5 as brick } from "../../models/brick/BrickV5";
import { pageSnapshotV8 as pageSnapshot } from "../../models/pageSnapshot/PageSnapshotV8";
import { makePageSnapshotV8 } from "../../snapshots/makePageSnapshotV8";
import { publishSiteV7 } from "./PublishSiteV7";
import { wallV4 as wall } from "../../models/wall/WallV4";

export const publishSiteV8 = upgradeAggregateContractRelease(publishSiteV7, {
  version: 8,
  payload: {},
  models: { brick, pageSnapshot, wall },
  operations: { createPageSnapshot: pageSnapshot.operations.create },
  down: Effect.fn("publishSiteV8.down")(function* (props) {
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
        attributes: { isPublished: true, publishedSnapshotId: selection.snapshotId },
      });
    }
    yield* operations.updateSite({ resourceId: payload.siteId, attributes: { isPublished: true } });
  }),
});
