import { wall as wallIdentity } from "../../models/wall/wall";

import { section as sectionIdentity } from "../../models/section/section";

import {
  modelId,
  ContractError,
  defineAggregateContract,
  makeAggregateContractVersion,
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

import { wallV1 as wall } from "../../models/wall/WallV1";

import { sectionV1 as section } from "../../models/section/SectionV1";

import { stackV1 as stack } from "../../models/stack/StackV1";

import { rowV1 as row } from "../../models/row/RowV1";

import { brickV1 as brick } from "../../models/brick/BrickV1";

import { placementV1 as placement } from "../../models/placement/PlacementV1";

export const addWallSectionV1 = makeAggregateContractVersion(
  defineAggregateContract("addWallSection"),
  {
    version: 1,
    models: {
      page,
      site,
      user,
      wall,
      section,
      stack,
      row,
      brick,
      placement,
    },
    claims: userClaims,
    operations: {
      createSection: section.operations.create,
      updateSection: section.operations.update,
      createStack: stack.operations.create,
    },
    payload: {
      id: primitives.text(),
      wallId: modelId({ model: wallIdentity }),
      beforeSectionId: modelId({ model: sectionIdentity, nullable: true }),
    },
    failures: { invalidLayout: ContractError.schema({ code: "add-wall-section-invalid-layout" }) },
    program: Effect.fn("addWallSection.program")(function* (props) {
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
      const pageId = wallRow.pageId;
      const pageRow = yield* findFirst({
        db,
        model: db.models.page,
        where: { id: { eq: pageId } },
      });
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
      const sections = (yield* findMany({
        db,
        model: db.models.section,
        where: { wallId: { eq: wallRow.id } },
      })).sort((a, b) => a.position - b.position);
      const position =
        payload.beforeSectionId === null
          ? sections.length
          : sections.findIndex((entry) => entry.id === payload.beforeSectionId);
      if (position < 0)
        return yield* failures.invalidLayout.make({
          message: "This Section insertion point no longer exists",
          status: 409,
        });
      for (let index = position; index < sections.length; index++)
        yield* operations.updateSection({
          resourceId: sections[index].id,
          attributes: { position: index + 1 },
        });
      const sectionId = prefixId(section, payload.id);
      yield* operations.createSection({
        resourceId: sectionId,
        attributes: { wallId: wallRow.id, position },
      });
      yield* operations.createStack({
        resourceId: prefixId(stack, payload.id),
        attributes: { sectionId, name: "Stack", position: 0 },
      });
    }),
  },
);
