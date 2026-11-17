import { wall as wallIdentity } from "@qrk.sh/bricks/zerospin/models/wall/wall";
import {
  modelId,
  ContractError,
  defineAggregateContract,
  makeAggregateContractRelease,
  findFirst,
  prefixId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { userClaims } from "@qrk.sh/bricks/zerospin/userClaims";
import { pageV1 as page } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { siteV1 as site } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 as user } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { wallV1 as wall } from "@qrk.sh/bricks/zerospin/models/wall/WallV1";
import { sectionIdSchema } from "@qrk.sh/bricks/zerospin/models/wall/wallLayoutSchema";

export const addWallSectionV1 = makeAggregateContractRelease(
  defineAggregateContract("addWallSection"),
  {
    version: 1,
    models: {
      page: {
        model: page,
        fields: [
          "createdAt",
          "updatedAt",
          "siteId",
          "slug",
          "title",
          "description",
          "isPublished",
          "publishedSnapshotId",
        ],
      },
      site: {
        model: site,
        fields: [
          "hostname",
          "name",
          "createdAt",
          "updatedAt",
          "slug",
          "description",
          "isPublished",
          "userId",
          "logoUrl",
          "faviconLightUrl",
          "faviconDarkUrl",
          "stickyNavbar",
          "cardStyle",
          "brickGap",
        ],
      },
      user: { model: user, fields: ["createdAt", "updatedAt", "clerkUserId", "displayName"] },
      wall: { model: wall, fields: ["createdAt", "updatedAt", "pageId", "breakpoint", "layout"] },
    },
    claims: userClaims,
    operations: { updateWall: wall.operations.update },
    payload: {
      id: primitives.text(),
      wallId: modelId({ model: wallIdentity }),
      beforeSectionId: primitives.json({ schema: Schema.NullOr(sectionIdSchema) }),
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
      const sections = [...wallRow.layout.sections];
      const index =
        payload.beforeSectionId === null
          ? sections.length
          : sections.findIndex((entry) => entry.id === payload.beforeSectionId);
      if (index < 0)
        return yield* failures.invalidLayout.make({
          message: "This Section insertion point no longer exists",
          status: 409,
        });
      sections.splice(index, 0, {
        id: prefixId({ abbreviation: "sec" }, payload.id),
        stacks: [{ id: prefixId({ abbreviation: "stk" }, payload.id), name: "Stack", rows: [] }],
      });
      yield* operations.updateWall({
        resourceId: wallRow.id,
        attributes: { layout: { sections } },
      });
    }),
  },
);
