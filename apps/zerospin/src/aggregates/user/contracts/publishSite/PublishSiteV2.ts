import { findFirst, findMany, upgradeAggregateContractRelease } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brickV2 } from "../../models/brick/BrickV2";
import { pageSnapshotV2 } from "../../models/pageSnapshot/PageSnapshotV2";
import { makePageSnapshotV2 } from "../../snapshots/makePageSnapshotV2";
import { publishSiteV1 } from "./PublishSiteV1";

export const publishSiteV2 = upgradeAggregateContractRelease(publishSiteV1, {
  version: 2,
  payload: {},
  models: { brick: { model: brickV2, fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth", "stateRevision"] }, pageSnapshot: { model: pageSnapshotV2, fields: ["createdAt", "updatedAt", "pageId", "content"] } },
  operations: { createPageSnapshot: pageSnapshotV2.operations.create },
  program: Effect.fn("publishSite")(function* (props) {
    const { payload, operations, failures, db } = props;
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
          content: makePageSnapshotV2({ page, bricks, walls, placements }),
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
