import {
  ContractError,
  defineAggregateContract,
  makeAggregateContractVersion,
  findFirst,
  findMany,
  prefixId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { userClaims } from "../../../../claims";
import { pageV3 as page } from "../../models/page/PageV3";
import { siteV3 as site } from "../../models/site/SiteV3";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { sectionV1 as section } from "../../models/section/SectionV1";
import { stackV1 as stack } from "../../models/stack/StackV1";
import { rowV1 as row } from "../../models/row/RowV1";
import { brickV1 as brick } from "../../models/brick/BrickV1";
import { placementV1 as placement } from "../../models/placement/PlacementV1";
export const deleteBrick = makeAggregateContractVersion(defineAggregateContract("deleteBrick"), {
  version: "1.0.0",
  models: { page, site, user, wall, section, stack, row, brick, placement },
  claims: userClaims,
  operations: {
    deleteBrick: brick.operations.delete,
    deletePlacement: placement.operations.delete,
    updatePlacement: placement.operations.update,
  },
  payload: { brickId: primitives.foreignKey({ abbreviation: "brk" }) },
  failures: { invalidLayout: ContractError.schema({ code: "delete-brick-invalid-layout" }) },
  program: Effect.fn("deleteBrick.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const content = yield* findFirst({ db, model: brick, where: { id: { eq: payload.brickId } } });
    if (content === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Brick no longer exists",
        status: 404,
      });
    const pageId = content.pageId;
    const pageRow = yield* findFirst({ db, model: page, where: { id: { eq: pageId } } });
    const siteRow =
      pageRow === undefined || pageRow.siteId === null
        ? undefined
        : yield* findFirst({ db, model: site, where: { id: { eq: pageRow.siteId } } });
    const userRow =
      siteRow === undefined || siteRow.userId === null
        ? undefined
        : yield* findFirst({ db, model: user, where: { id: { eq: siteRow.userId } } });
    if (userRow === undefined || userRow.clerkUserId !== claims?.clerkUserId)
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const placements = yield* findMany({
      db,
      model: placement,
      where: { brickId: { eq: content.id } },
    });
    for (const entry of placements) {
      yield* operations.deletePlacement({ resourceId: entry.id });
      const siblings = (yield* findMany({
        db,
        model: placement,
        where: { rowId: { eq: entry.rowId } },
      }))
        .filter((sibling) => sibling.id !== entry.id)
        .sort((a, b) => a.position - b.position);
      for (let index = 0; index < siblings.length; index++)
        yield* operations.updatePlacement({
          resourceId: siblings[index].id,
          attributes: { position: index },
        });
    }
    yield* operations.deleteBrick({ resourceId: content.id });
  }),
});
