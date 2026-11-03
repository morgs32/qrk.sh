import {
  modelId,
  ContractError,
  defineAggregateContract,
  makeAggregateContractRelease,
  findFirst,
  findMany,
  prefixId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { userClaims } from "../../../../claims";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { brickV2 as brick } from "../../models/brick/BrickV2";
import { wall as wallIdentity } from "../../models/wall/wall";
import { stackIdSchema } from "../../layout/wallLayoutSchema";
import { measureWallFit, wallBreakpointWidths } from "../../layout/wallSizing";
import { backendLibrary } from "../../../../modules/backendLibrary";

export const insertStackV1 = makeAggregateContractRelease(defineAggregateContract("insertStack"), {
  version: 1,
  models: { page, site, user, wall, placement, brick },
  claims: userClaims,
  operations: { updateWall: wall.operations.update },
  payload: {
    id: primitives.text(),
    wallId: modelId({ model: wallIdentity }),
    anchorStackId: primitives.json({ schema: stackIdSchema }),
    side: primitives.enum({ values: ["left", "right"] }),
  },
  failures: { invalidLayout: ContractError.schema({ code: "insert-stack-invalid-layout" }) },
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
    section.stacks.splice(index + (payload.side === "right" ? 1 : 0), 0, {
      id: stackId,
      name: "Stack",
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
