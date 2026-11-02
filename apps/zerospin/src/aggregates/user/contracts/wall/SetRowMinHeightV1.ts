import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { userClaims } from "../../../../claims";
import { rowIdSchema } from "../../layout/wallLayoutSchema";
import { wall as wallIdentity } from "../../models/wall/wall";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";

export const setRowMinHeightV1 = makeAggregateContractRelease(
  defineAggregateContract("setRowMinHeight"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      wallId: modelId({ model: wallIdentity }),
      rowId: primitives.json({ schema: rowIdSchema }),
      minHeight: primitives.json({
        schema: Schema.NullOr(
          Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(45)),
        ),
      }),
    },
    models: { wall, page, site, user },
    operations: { updateWall: wall.operations.update },
    failures: { invalidSizing: ContractError.schema({ code: "row-min-height-invalid" }) },
    program: Effect.fn("setRowMinHeight.program")(function* (props) {
      const { payload, claims, db, operations, failures } = props;
      if (claims === null)
        return yield* failures.invalidSizing.make({
          message: "Changing Row height requires an authenticated user",
          status: 403,
        });
      const wallRow = yield* findFirst({
        db,
        model: db.models.wall,
        where: { id: { eq: payload.wallId } },
      });
      if (wallRow === undefined)
        return yield* failures.invalidSizing.make({
          message: "The Wall no longer exists",
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
      if (userRow === undefined || userRow.clerkUserId !== claims.clerkUserId)
        return yield* failures.invalidSizing.make({
          message: "This Page is unavailable",
          status: 403,
        });
      const row = wallRow.layout.sections
        .flatMap((section) => section.stacks)
        .flatMap((stack) => stack.rows)
        .find((entry) => entry.id === payload.rowId);
      if (row === undefined)
        return yield* failures.invalidSizing.make({
          message: "The Row no longer exists",
          status: 409,
        });
      if (row.minHeight === payload.minHeight) return;
      const layout = {
        sections: wallRow.layout.sections.map((section) => ({
          ...section,
          stacks: section.stacks.map((stack) => ({
            ...stack,
            rows: stack.rows.map((entry) =>
              entry.id === row.id ? { ...entry, minHeight: payload.minHeight } : entry,
            ),
          })),
        })),
      };
      yield* operations.updateWall({ resourceId: wallRow.id, attributes: { layout } });
    }),
  },
);
