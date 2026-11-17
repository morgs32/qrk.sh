import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { brick } from "@qrk.sh/bricks/zerospin/models/brick/brick";
import { brickV1 } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import { pageV1 } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { siteV1 } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";

export const setBrickBorderWidthV1 = makeAggregateContractRelease(
  defineAggregateContract("setBrickBorderWidth"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      brickId: modelId({ model: brick }),
      borderWidth: primitives.integer(),
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
    failures: {
      invalidWidth: ContractError.schema({ code: "brick-border-width-invalid" }),
      notFound: ContractError.schema({ code: "set-brick-border-width-not-found" }),
      userMismatch: ContractError.schema({ code: "set-brick-border-width-user-mismatch" }),
    },
    guard: Effect.fn("setBrickBorderWidth.guard")(function* (props) {
      const { payload, claims, db, failures } = props;
      if (payload.borderWidth < 0 || payload.borderWidth > 12) {
        return yield* failures.invalidWidth.make({
          message: "Border width must be a whole number from 0 to 12 pixels",
          status: 400,
        });
      }
      if (claims === null) {
        return yield* failures.userMismatch.make({
          message: "Changing a Brick border requires an authenticated user",
          status: 403,
        });
      }
      const brickRow = yield* findFirst({
        db,
        model: db.models.brick,
        where: { id: { eq: payload.brickId } },
      });
      if (brickRow === undefined) {
        return yield* failures.notFound.make({
          message: `Brick ${payload.brickId} was not found`,
          status: 404,
        });
      }
      const pageRow = yield* findFirst({
        db,
        model: db.models.page,
        where: { id: { eq: brickRow.pageId } },
      });
      const siteRow =
        pageRow === undefined || pageRow.siteId === null
          ? undefined
          : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
      const userRow =
        siteRow === undefined || siteRow.userId === null
          ? undefined
          : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
      if (userRow === undefined || userRow.clerkUserId !== claims.clerkUserId) {
        return yield* failures.userMismatch.make({
          message: "This Brick does not belong to the authenticated user",
          status: 403,
        });
      }
    }),
    program: Effect.fn("setBrickBorderWidth.program")(function* (props) {
      const { payload, operations } = props;
      yield* operations.updateBrick({
        resourceId: payload.brickId,
        attributes: { borderWidth: payload.borderWidth },
      });
    }),
  },
);
