import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { brickV1 } from "../../../zerospin/models/brick/BrickV1";
import { pageV1 } from "../../../zerospin/models/page/PageV1";
import { placement } from "../../../zerospin/models/placement/placement";
import { placementV1 } from "../../../zerospin/models/placement/PlacementV1";
import { siteV1 } from "../../../zerospin/models/site/SiteV1";
import { userV1 } from "../../../zerospin/models/user/UserV1";
import { wallV1 } from "../../../zerospin/models/wall/WallV1";
import { userClaims } from "../../../zerospin/userClaims";
import { textPlacementStateSchema } from "./textPlacementState";

export const updateTextPlacementV1 = makeAggregateContractRelease(
  defineAggregateContract("updateTextPlacement"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      placementId: modelId({ model: placement }),
      state: primitives.json({ schema: textPlacementStateSchema }),
    },
    models: { brick: brickV1, placement: placementV1, wall: wallV1, page: pageV1, site: siteV1, user: userV1 },
    operations: { updatePlacement: placementV1.operations.update },
    failures: { unavailable: ContractError.schema({ code: "update-text-placement-unavailable" }) },
    guard: Effect.fn("updateTextPlacement.guard")(function* (props) {
      const { payload, claims, db, failures } = props;
      const placementRow = yield* findFirst({ db, model: db.models.placement, where: { id: { eq: payload.placementId } } });
      const brickRow = placementRow === undefined ? undefined : yield* findFirst({
        db, model: db.models.brick, where: { id: { eq: placementRow.brickId } },
      });
      const wallRow = placementRow === undefined ? undefined : yield* findFirst({
        db, model: db.models.wall, where: { id: { eq: placementRow.wallId } },
      });
      const pageRow = brickRow === undefined ? undefined : yield* findFirst({
        db, model: db.models.page, where: { id: { eq: brickRow.pageId } },
      });
      const siteRow = pageRow === undefined || pageRow.siteId === null ? undefined : yield* findFirst({
        db, model: db.models.site, where: { id: { eq: pageRow.siteId } },
      });
      const userRow = siteRow === undefined || siteRow.userId === null ? undefined : yield* findFirst({
        db, model: db.models.user, where: { id: { eq: siteRow.userId } },
      });
      if (placementRow === undefined || brickRow === undefined || brickRow.moduleId !== "text" ||
          wallRow === undefined || wallRow.pageId !== brickRow.pageId ||
          !wallRow.layout.sections.some((section) => section.stacks.some((stack) =>
            stack.rows.some((row) => row.placementIds.includes(placementRow.id)))) ||
          userRow === undefined || claims === null || userRow.clerkUserId !== claims.clerkUserId) {
        return yield* failures.unavailable.make({ message: "This Text Placement is unavailable", status: 403 });
      }
    }),
    program: Effect.fn("updateTextPlacement.program")(function* (props) {
      const { payload, operations } = props;
      yield* operations.updatePlacement({
        resourceId: payload.placementId,
        attributes: { state: structuredClone(payload.state) },
      });
    }),
  },
);
