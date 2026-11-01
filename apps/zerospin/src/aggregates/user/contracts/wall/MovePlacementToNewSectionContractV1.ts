import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Result, Schema } from "effect";
import { userClaims } from "../../../../claims";
import { sectionIdSchema, stackIdSchema, rowIdSchema } from "../../layout/wallLayoutSchema";
import { movePlacementToNewSectionInLayout } from "../../layout/wallLayout";
import { pageV1 as page } from "../../models/page/PageV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
import { placement as placementIdentity } from "../../models/placement/placement";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV1 as wall } from "../../models/wall/WallV1";

export const movePlacementToNewSectionV1 = makeAggregateContractRelease(
  defineAggregateContract("movePlacementToNewSection"),
  {
    version: 1,
    claims: userClaims,
    models: { page, placement, site, user, wall },
    operations: { updateWall: wall.operations.update },
    payload: {
      placementId: modelId({ model: placementIdentity }),
      newSectionId: primitives.json({ schema: sectionIdSchema }),
      newStackId: primitives.json({ schema: stackIdSchema }),
      newRowId: primitives.json({ schema: rowIdSchema }),
      beforeSectionId: primitives.json({ schema: Schema.NullOr(sectionIdSchema) }),
    },
    failures: { invalidLayout: ContractError.schema({ code: "move-placement-invalid-layout" }) },
    program: Effect.fn("movePlacementToNewSection.program")(function* (props) {
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
      if (userRow === undefined || userRow.clerkUserId !== claims.clerkUserId)
        return yield* failures.invalidLayout.make({
          message: "This Page is unavailable",
          status: 403,
        });
      const changed = movePlacementToNewSectionInLayout({
        layout: wallRow.layout,
        placementId: moving.id,
        newSectionId: payload.newSectionId,
        newStackId: payload.newStackId,
        newRowId: payload.newRowId,
        beforeSectionId: payload.beforeSectionId,
        stackLimit: { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint],
      });
      if (Result.isFailure(changed))
        return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
      if (changed.success === wallRow.layout) return;
      yield* operations.updateWall({
        resourceId: wallRow.id,
        attributes: { layout: changed.success },
      });
    }),
  },
);
