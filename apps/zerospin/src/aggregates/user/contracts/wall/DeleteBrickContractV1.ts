import { brick as brickIdentity } from "../../models/brick/brick";
import {
  modelId,
  ContractError,
  defineAggregateContract,
  makeAggregateContractVersion,
  findFirst,
  findMany,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
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
import { cleanupWall } from "./utils/cleanupWall";
export const deleteBrick = makeAggregateContractVersion(defineAggregateContract("deleteBrick"), {
  version: "1.0.0",
  models: { page, site, user, wall, section, stack, row, brick, placement },
  claims: userClaims,
  operations: {
    deleteBrick: brick.operations.delete,
    deletePlacement: placement.operations.delete,
    updatePlacement: placement.operations.update,
    updateRow: row.operations.update,
    deleteRow: row.operations.delete,
    updateStack: stack.operations.update,
    deleteStack: stack.operations.delete,
    updateSection: section.operations.update,
    deleteSection: section.operations.delete,
  },
  payload: { brickId: modelId({ model: brickIdentity }) },
  failures: { invalidLayout: ContractError.schema({ code: "delete-brick-invalid-layout" }) },
  program: Effect.fn("deleteBrick.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const content = yield* findFirst({ db, model: db.models.brick, where: { id: { eq: payload.brickId } } });
    if (content === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Brick no longer exists",
        status: 404,
      });
    const pageId = content.pageId;
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
    const placements = yield* findMany({
      db,
      model: db.models.placement,
      where: { brickId: { eq: content.id } },
    });
    const walls = yield* findMany({
      db,
      model: db.models.wall,
      where: { pageId: { eq: pageId } },
      columns: { id: true },
      with: {
        sections: {
          columns: { id: true, position: true },
          orderBy: { position: "asc" },
          with: {
            stacks: {
              columns: { id: true, position: true },
              orderBy: { position: "asc" },
              with: {
                rows: {
                  columns: { id: true, position: true },
                  orderBy: { position: "asc" },
                  with: {
                    placements: {
                      columns: { id: true, position: true },
                      orderBy: { position: "asc" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const removedIds = new Set(placements.map((entry) => entry.id));
    yield* Effect.forEach(placements, (entry) =>
      operations.deletePlacement({ resourceId: entry.id }),
    );
    yield* Effect.forEach(walls, (entry) =>
      Effect.gen(function* () {
        for (const currentSection of entry.sections)
          for (const currentStack of currentSection.stacks)
            for (const currentRow of currentStack.rows)
              currentRow.placements = currentRow.placements.filter(
                (currentPlacement) => !removedIds.has(currentPlacement.id),
              );
        yield* cleanupWall({ sections: entry.sections, operations });
      }),
    );
    yield* operations.deleteBrick({ resourceId: content.id });
  }),
});
