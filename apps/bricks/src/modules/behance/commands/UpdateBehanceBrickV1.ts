import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import { brick } from "../../../zerospin/models/brick/brick";
import { brickV1 } from "../../../zerospin/models/brick/BrickV1";
import { pageV1 } from "../../../zerospin/models/page/PageV1";
import { siteV1 } from "../../../zerospin/models/site/SiteV1";
import { userV1 } from "../../../zerospin/models/user/UserV1";
import { userClaims } from "../../../zerospin/userClaims";
import { completeStateSchema } from "../definition/behanceV1";

export const updateBehanceBrickV1 = makeAggregateContractRelease(
  defineAggregateContract("updateBehanceBrick"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      brickId: modelId({ model: brick }),
      state: primitives.json({ schema: completeStateSchema }),
    },
    models: {
      brick: {
        model: brickV1,
        fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth"],
      },
      page: {
        model: pageV1,
        fields: [
          "createdAt",
          "updatedAt",
          "siteId",
          "slug",
          "title",
          "description",
          "isPublished",
          "publishedSnapshotId",
        ],
      },
      site: {
        model: siteV1,
        fields: [
          "hostname",
          "name",
          "createdAt",
          "updatedAt",
          "slug",
          "description",
          "isPublished",
          "userId",
          "logoUrl",
          "faviconLightUrl",
          "faviconDarkUrl",
          "stickyNavbar",
          "cardStyle",
          "brickGap",
        ],
      },
      user: { model: userV1, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
    },
    operations: { updateBrick: brickV1.operations.update },
    failures: { unavailable: ContractError.schema({ code: "update-behance-brick-unavailable" }) },
    guard: Effect.fn("updateBehanceBrick.guard")(function* (props) {
      const { payload, claims, db, failures } = props;
      const brickRow = yield* findFirst({
        db,
        model: db.models.brick,
        where: { id: { eq: payload.brickId } },
      });
      const pageRow =
        brickRow === undefined
          ? undefined
          : yield* findFirst({
              db,
              model: db.models.page,
              where: { id: { eq: brickRow.pageId } },
            });
      const siteRow =
        pageRow === undefined || pageRow.siteId === null
          ? undefined
          : yield* findFirst({
              db,
              model: db.models.site,
              where: { id: { eq: pageRow.siteId } },
            });
      const userRow =
        siteRow === undefined || siteRow.userId === null
          ? undefined
          : yield* findFirst({
              db,
              model: db.models.user,
              where: { id: { eq: siteRow.userId } },
            });
      if (
        brickRow === undefined ||
        brickRow.moduleId !== "behance" ||
        userRow === undefined ||
        claims === null ||
        userRow.clerkUserId !== claims.clerkUserId
      ) {
        return yield* failures.unavailable.make({
          message: "This Behance Brick is unavailable",
          status: 403,
        });
      }
    }),
    program: Effect.fn("updateBehanceBrick.program")(function* (props) {
      const { payload, operations } = props;
      yield* operations.updateBrick({
        resourceId: payload.brickId,
        attributes: { state: structuredClone(payload.state) },
      });
    }),
  },
);
