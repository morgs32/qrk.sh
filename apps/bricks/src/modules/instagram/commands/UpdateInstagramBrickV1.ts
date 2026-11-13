import { ContractError, defineAggregateContract, findFirst, makeAggregateContractRelease, modelId, primitives } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brick } from "../../../zerospin/models/brick/brick";
import { brickV1 } from "../../../zerospin/models/brick/BrickV1";
import { pageV1 } from "../../../zerospin/models/page/PageV1";
import { siteV1 } from "../../../zerospin/models/site/SiteV1";
import { userV1 } from "../../../zerospin/models/user/UserV1";
import { userClaims } from "../../../zerospin/userClaims";
import { completeStateSchema } from "../definition/instagramV1";

export const updateInstagramBrickV1 = makeAggregateContractRelease(defineAggregateContract("updateInstagramBrick"), {
  version: 1,
  claims: userClaims,
  payload: {
    brickId: modelId({ model: brick }),
    state: primitives.json({ schema: completeStateSchema }),
  },
  models: { brick: brickV1, page: pageV1, site: siteV1, user: userV1 },
  operations: { updateBrick: brickV1.operations.update },
  failures: { unavailable: ContractError.schema({ code: "update-instagram-brick-unavailable" }) },
  guard: Effect.fn("updateInstagramBrick.guard")(function* (props) {
    const { payload, claims, db, failures } = props;
    const brickRow = yield* findFirst({ db, model: db.models.brick, where: { id: { eq: payload.brickId } } });
    const pageRow = brickRow === undefined ? undefined : yield* findFirst({
      db, model: db.models.page, where: { id: { eq: brickRow.pageId } },
    });
    const siteRow = pageRow === undefined || pageRow.siteId === null ? undefined : yield* findFirst({
      db, model: db.models.site, where: { id: { eq: pageRow.siteId } },
    });
    const userRow = siteRow === undefined || siteRow.userId === null ? undefined : yield* findFirst({
      db, model: db.models.user, where: { id: { eq: siteRow.userId } },
    });
    if (brickRow === undefined || brickRow.moduleId !== "instagram" || userRow === undefined ||
        claims === null || userRow.clerkUserId !== claims.clerkUserId) {
      return yield* failures.unavailable.make({ message: "This Instagram Brick is unavailable", status: 403 });
    }
  }),
  program: Effect.fn("updateInstagramBrick.program")(function* (props) {
    const { payload, operations } = props;
    yield* operations.updateBrick({
      resourceId: payload.brickId,
      attributes: { state: structuredClone(payload.state) },
    });
  }),
});
