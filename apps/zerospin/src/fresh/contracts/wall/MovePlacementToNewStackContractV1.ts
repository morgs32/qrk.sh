import { brickV1 as brick } from "@qrk.sh/bricks/zerospin/models/brick/BrickV1";
import { measureWallFit, wallBreakpointWidths } from "@qrk.sh/bricks/zerospin/wall/wallSizing";
import { backendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { findMany } from "@zerospin/sdk/browser";
import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import {
  sectionIdSchema,
  stackIdSchema,
  rowIdSchema,
} from "@qrk.sh/bricks/zerospin/models/wall/wallLayoutSchema";
import { movePlacementToNewStackInLayout } from "@qrk.sh/bricks/zerospin/wall/wallLayout";
import { pageV1 as page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { placementV1 as placement } from "@qrk.sh/bricks/zerospin/models/placement/PlacementV1";
import { placement as placementIdentity } from "@qrk.sh/bricks/zerospin/models/placement/placement";
import { siteV1 as site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 as user } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { wallV1 as wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";

export const movePlacementToNewStackV1 = makeAggregateContractRelease(
  defineAggregateContract("movePlacementToNewStack"),
  {
    version: 1,
    claims: userClaims,
    models: {
      page: {
        model: page,
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
      placement: {
        model: placement,
        fields: ["createdAt", "updatedAt", "state", "brickId", "wallId", "layoutId", "widthWeight"],
      },
      site: {
        model: site,
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
      user: { model: user, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
      wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] },
      brick: {
        model: brick,
        fields: ["createdAt", "updatedAt", "pageId", "moduleId", "state", "borderWidth"],
      },
    },
    operations: { updateWall: wall.operations.update },
    payload: {
      placementId: modelId({ model: placementIdentity }),
      sectionId: primitives.json({ schema: sectionIdSchema }),
      newStackId: primitives.json({ schema: stackIdSchema }),
      newRowId: primitives.json({ schema: rowIdSchema }),
    },
    failures: { invalidLayout: ContractError.schema({ code: "move-placement-invalid-layout" }) },
    program: Effect.fn("movePlacementToNewStack.program")(function* (props) {
      const { db, payload, operations, failures, claims } = props;
      if (claims === null)
        return yield* failures.invalidLayout.make({
          message: "Moving a Placement requires an authenticated user",
          status: 403,
        });
      const moving = yield* findFirst({
        db,
        model: db.models.placement,
        where: { id: { eq: payload.placementId } },
      });
      if (moving === undefined)
        return yield* failures.invalidLayout.make({
          message: "The Placement no longer exists",
          status: 404,
        });
      const wallRow = yield* findFirst({
        db,
        model: db.models.wall,
        where: { id: { eq: moving.wallId } },
      });
      if (wallRow === undefined)
        return yield* failures.invalidLayout.make({
          message: "The Placement's Wall no longer exists",
          status: 404,
        });
      const pageRow = yield* findFirst({
        db,
        model: db.models.page,
        where: { id: { eq: wallRow.pageId } },
      });
      const siteRow =
        pageRow === undefined
          ? undefined
          : yield* findFirst({
              db,
              model: db.models.site,
              where: { id: { eq: pageRow.siteId } },
            });
      const userRow =
        siteRow === undefined
          ? undefined
          : yield* findFirst({
              db,
              model: db.models.user,
              where: { id: { eq: siteRow.userId } },
            });
      if (
        siteRow === undefined ||
        userRow === undefined ||
        userRow.clerkUserId !== claims.clerkUserId
      )
        return yield* failures.invalidLayout.make({
          message: "This Page is unavailable",
          status: 403,
        });
      const changed = movePlacementToNewStackInLayout({
        layout: wallRow.layout,
        placementId: moving.id,
        sectionId: payload.sectionId,
        newStackId: payload.newStackId,
        newRowId: payload.newRowId,
      });
      if (Result.isFailure(changed))
        return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
      if (changed.success === wallRow.layout) return;
      const placements = yield* findMany({
        db,
        model: db.models.placement,
        where: { wallId: { eq: wallRow.id } },
        with: { brick: true },
      });
      if (placements.some((entry) => entry.brick.pageId !== wallRow.pageId))
        throw new Error("The Wall contains a Placement from another Page");
      const fit = measureWallFit({
        layout: changed.success,
        placementMinimumWidths: new Map(
          placements.map((entry) => [
            entry.id,
            backendLibrary[entry.brick.moduleId].variants.default.minWidth,
          ]),
        ),
        wallWidth: wallBreakpointWidths[wallRow.breakpoint],
        brickGap: siteRow.brickGap,
      });
      if (fit.some((section) => !section.fits))
        return yield* failures.invalidLayout.make({
          message: "Not enough space in this Section",
          status: 409,
        });

      yield* operations.updateWall({
        resourceId: wallRow.id,
        attributes: { layout: changed.success },
      });
    }),
  },
);
