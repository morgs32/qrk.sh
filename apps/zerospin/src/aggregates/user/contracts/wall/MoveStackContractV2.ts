import { upgradeAggregateContractRelease, findFirst, prefixId } from "@zerospin/sdk/browser";
import { Effect, Result } from "effect";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { moveStackV1 } from "./MoveStackContractV1";
import { moveStackInLayout } from "../../layout/wallLayoutV2";

export const moveStackV2 = upgradeAggregateContractRelease(moveStackV1, {
  version: 2,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  program: Effect.fn("moveStack.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const { target } = payload;
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: target.wallId } },
    });
    if (
      wallRow === undefined ||
      !wallRow.layout.sections.some((entry) =>
        entry.stacks.some((entry) => entry.id === payload.stackId),
      )
    )
      return yield* failures.invalidLayout.make({
        message: "Stacks can only move within their Wall",
        status: 409,
      });
    const pageId = wallRow.pageId;
    const pageRow = yield* findFirst({ db, model: db.models.page, where: { id: { eq: pageId } } });
    const siteRow =
      pageRow === undefined || pageRow.siteId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
    const userRow =
      siteRow === undefined || siteRow.userId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
    if (userRow === undefined || userRow.clerkUserId !== claims?.clerkUserId)
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const changed = moveStackInLayout({
      layout: wallRow.layout,
      target,
      stackId: payload.stackId,
      newSectionId: prefixId({ abbreviation: "sec" }, payload.id),
      stackLimit: { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint],
    });
    if (Result.isFailure(changed))
      return yield* failures.invalidLayout.make({ message: changed.failure, status: 409 });
    if (changed.success !== wallRow.layout)
      yield* operations.updateWall({
        resourceId: wallRow.id,
        attributes: { layout: changed.success },
      });
  }),
});
