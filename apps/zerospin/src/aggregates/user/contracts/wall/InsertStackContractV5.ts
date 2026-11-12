import {
  upgradeAggregateContractRelease,
  findFirst,
  findMany,
  prefixId,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { backendLibrary } from "@qrk.sh/bricks/modules/backendLibrary";
import { measureWallFit, wallBreakpointWidths } from "../../layout/wallSizing";
import { insertStackV4 } from "./InsertStackContractV4";

export const insertStackV5 = upgradeAggregateContractRelease(insertStackV4, {
  version: 5,
  payload: {},
  models: { wall },
  operations: { updateWall: wall.operations.update },
  down: Effect.fn("insertStackV5.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  program: Effect.fn("insertStack.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: payload.wallId } },
    });
    if (wallRow === undefined)
      return yield* failures.invalidLayout.make({
        message: "This Wall no longer exists",
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
      userRow.clerkUserId !== claims?.clerkUserId
    )
      return yield* failures.invalidLayout.make({
        message: "This Page is unavailable",
        status: 403,
      });
    const candidate = structuredClone(wallRow.layout);
    const section = candidate.sections.find((entry) =>
      entry.stacks.some((stack) => stack.id === payload.anchorStackId),
    );
    if (section === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Stack insertion point no longer exists",
        status: 409,
      });
    const stackId = prefixId({ abbreviation: "stk" }, payload.id);
    if (candidate.sections.some((entry) => entry.stacks.some((stack) => stack.id === stackId)))
      return yield* failures.invalidLayout.make({
        message: "The new Stack ID already belongs to this Wall",
        status: 409,
      });
    const index = section.stacks.findIndex((stack) => stack.id === payload.anchorStackId);
    const count = section.stacks.length;
    const maximum = section.stacks.reduce((max, stack) => Math.max(max, stack.widthWeight ?? 1), 0);
    const widthWeight = section.stacks.every((stack) => stack.widthWeight === undefined)
      ? 1
      : maximum *
        Math.min(
          1,
          section.stacks.reduce(
            (sum, stack) => sum + (stack.widthWeight ?? 1) / maximum / count,
            0,
          ),
        );
    section.stacks.splice(index + (payload.side === "right" ? 1 : 0), 0, {
      id: stackId,
      name: "Stack",
      ...(widthWeight === 1 ? {} : { widthWeight }),
      rows: [],
    });
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { wallId: { eq: wallRow.id } },
      with: { brick: true },
    });
    if (placements.some((entry) => entry.brick.pageId !== wallRow.pageId))
      throw new Error("The Wall contains a Placement from another Page");
    const fit = measureWallFit({
      layout: candidate,
      placementMinimumWidths: new Map(
        placements.map((entry) => [
          entry.id,
          backendLibrary[entry.brick.moduleId].variants[entry.variantId].minWidth,
        ]),
      ),
      wallWidth: wallBreakpointWidths[wallRow.breakpoint],
      brickGap: siteRow.brickGap,
    });
    if (fit.some((entry) => !entry.fits))
      return yield* failures.invalidLayout.make({
        message: "Not enough space in this Section",
        status: 409,
      });
    yield* operations.updateWall({ resourceId: wallRow.id, attributes: { layout: candidate } });
  }),
});
