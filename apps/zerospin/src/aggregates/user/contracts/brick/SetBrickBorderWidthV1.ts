import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { userClaims } from "../../../../claims";
import { brick } from "../../models/brick/brick";
import { brickV2 } from "../../models/brick/BrickV2";
import { pageV1 } from "../../models/page/PageV1";
import { siteV1 } from "../../models/site/SiteV1";
import { userV1 } from "../../models/user/UserV1";

export const setBrickBorderWidthV1 = makeAggregateContractRelease(
  defineAggregateContract("setBrickBorderWidth"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      brickId: modelId({ model: brick }),
      borderWidth: primitives.integer(),
    },
    models: { brick: brickV2, page: pageV1, site: siteV1, user: userV1 },
    operations: { updateBrick: brickV2.operations.update },
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
