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
const targetSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("section"),
    wallId: Schema.String,
    sectionId: Schema.String,
    beforeStackId: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("wall"),
    wallId: Schema.String,
    beforeSectionId: Schema.NullOr(Schema.String),
  }),
]);
export const moveStack = makeAggregateContractVersion(defineAggregateContract("moveStack"), {
  version: "1.0.0",
  models: { page, site, user, wall, section, stack, row, brick, placement },
  claims: userClaims,
  operations: {
    createSection: section.operations.create,
    updateSection: section.operations.update,
    updateStack: stack.operations.update,
  },
  payload: {
    id: primitives.text(),
    stackId: primitives.foreignKey({ abbreviation: "stk" }),
    target: primitives.json({ schema: targetSchema }),
  },
  failures: { invalidLayout: ContractError.schema({ code: "move-stack-invalid-layout" }) },
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
    const sections = (yield* findMany({
      db,
      model: section,
      where: { wallId: { eq: wallRow.id } },
    })).sort((a, b) => a.position - b.position);
    let destinationSection:
      | { id: `sec_${string}`; wallId: `wal_${string}`; position: number }
      | undefined =
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
    const siblings =
      destinationSection === undefined
        ? []
        : (yield* findMany({
            db,
            model: stack,
            where: { sectionId: { eq: destinationSection.id } },
          }))
            .filter((entry) => entry.id !== moving.id)
            .sort((a, b) => a.position - b.position);
    const capacity = { sm: 1, md: 2, lg: 3, xl: 4 }[wallRow.breakpoint];
    if (siblings.length >= capacity)
      return yield* failures.invalidLayout.make({
        message: "This Section has reached its Stack limit",
        status: 409,
      });
    const beforeStackId = target.kind === "section" ? target.beforeStackId : null;
    if (beforeStackId === moving.id) return;
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
      for (let index = sectionPosition; index < sections.length; index++)
        yield* operations.updateSection({
          resourceId: sections[index].id,
          attributes: { position: index + 1 },
        });
      yield* operations.createSection({
        resourceId: id,
        attributes: { wallId: wallRow.id, position: sectionPosition },
      });
      destinationSection = { id, wallId: wallRow.id, position: sectionPosition };
    }
    if (moving.sectionId !== destinationSection.id) {
      const sourceSiblings = (yield* findMany({
        db,
        model: stack,
        where: { sectionId: { eq: moving.sectionId } },
      }))
        .filter((entry) => entry.id !== moving.id)
        .sort((a, b) => a.position - b.position);
      for (let index = 0; index < sourceSiblings.length; index++)
        yield* operations.updateStack({
          resourceId: sourceSiblings[index].id,
          attributes: { position: index },
        });
    }
    for (let index = 0; index < siblings.length; index++)
      yield* operations.updateStack({
        resourceId: siblings[index].id,
        attributes: { position: index < position ? index : index + 1 },
      });
    yield* operations.updateStack({
      resourceId: moving.id,
      attributes: { sectionId: destinationSection.id, position },
    });
  }),
});
