import {
  upgradeAggregateContractVersion,
  findFirst,
  findMany,
  prefixId,
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
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { cleanupWall } from "./utils/cleanupWall";
import { moveStack } from "./MoveStackContractV1";

export const moveStackV2 = upgradeAggregateContractVersion(moveStack, {
  version: "2.0.0",
  up: Effect.fn("moveStackV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { page, site, user, wall, section, stack, row, brick, placement },
  claims: userClaims,
  operations: {
    createSection: section.operations.create,
    updateSection: section.operations.update,
    updateStack: stack.operations.update,
    deleteStack: stack.operations.delete,
    deleteSection: section.operations.delete,
    updateRow: row.operations.update,
    deleteRow: row.operations.delete,
    updatePlacement: placement.operations.update,
  },
  payload: {},
  program: Effect.fn("moveStack.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const { target } = payload;
    const moving = yield* findFirst({ db, model: stack, where: { id: { eq: payload.stackId } } });
    const sourceSection =
      moving === undefined
        ? undefined
        : yield* findFirst({ db, model: section, where: { id: { eq: moving.sectionId } } });
    const wallRow = yield* findFirst({ db, model: wall, where: { id: { eq: target.wallId } } });
    if (
      moving === undefined ||
      sourceSection === undefined ||
      wallRow === undefined ||
      sourceSection.wallId !== wallRow.id
    )
      return yield* failures.invalidLayout.make({
        message: "Stacks can only move within their Wall",
        status: 409,
      });
    const pageId = wallRow.pageId;
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
    const sections = yield* findMany({
      db,
      model: section,
      where: { wallId: { eq: wallRow.id } },
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
    });
    const source = sections.find((entry) => entry.id === sourceSection.id);
    const movingStack = source?.stacks.find((entry) => entry.id === moving.id);
    if (source === undefined || movingStack === undefined)
      return yield* failures.invalidLayout.make({
        message: "The Stack no longer belongs to this Wall",
        status: 409,
      });
    let destinationSection: (typeof sections)[number] | undefined =
      target.kind === "section"
        ? sections.find((entry) => entry.id === target.sectionId)
        : undefined;
    if (target.kind === "section" && destinationSection === undefined)
      return yield* failures.invalidLayout.make({
        message: "The destination Section no longer exists",
        status: 409,
      });
    if (
      target.kind === "wall" &&
      target.beforeSectionId !== null &&
      !sections.some((entry) => entry.id === target.beforeSectionId)
    )
      return yield* failures.invalidLayout.make({
        message: "The Section insertion point no longer exists",
        status: 409,
      });
    const beforeStackId = target.kind === "section" ? target.beforeStackId : null;
    if (destinationSection === source && beforeStackId === movingStack.id) return;
    const siblings =
      destinationSection?.stacks.filter((entry) => entry.id !== movingStack.id) ?? [];
    const position =
      beforeStackId === null
        ? siblings.length
        : siblings.findIndex((entry) => entry.id === beforeStackId);
    if (position < 0)
      return yield* failures.invalidLayout.make({
        message: "The Stack insertion point no longer exists",
        status: 409,
      });
    if (destinationSection === undefined) {
      const id = prefixId(section, payload.id);
      const sectionPosition =
        target.kind === "wall" && target.beforeSectionId !== null
          ? sections.findIndex((entry) => entry.id === target.beforeSectionId)
          : sections.length;
      yield* operations.createSection({
        resourceId: id,
        attributes: { wallId: wallRow.id, position: sectionPosition },
      });
      destinationSection = { id, position: sectionPosition, stacks: [] };
      sections.splice(sectionPosition, 0, destinationSection);
    }
    source.stacks = source.stacks.filter((entry) => entry.id !== movingStack.id);
    destinationSection.stacks.splice(position, 0, movingStack);
    yield* operations.updateStack({
      resourceId: movingStack.id,
      attributes: { sectionId: destinationSection.id },
    });
    yield* cleanupWall({ sections, operations });
    const capacity = { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint];
    if (sections.some((entry) => entry.stacks.length > capacity))
      return yield* failures.invalidLayout.make({
        message: "This Section has reached its Stack limit",
        status: 409,
      });
  }),
});
