import {
  ContractError,
  defineAggregateContract,
  findFirst,
  findMany,
  makeAggregateContractRelease,
  makeIdSchema,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect, Schema } from "effect";
import { userClaims } from "../../../../claims";
import { rowIdSchema } from "../../layout/wallLayoutSchema";
import { placement as placementIdentity } from "../../models/placement/placement";
import { wall as wallIdentity } from "../../models/wall/wall";
import { placementV2 as placement } from "../../models/placement/PlacementV2";
import { wallV2 as wall } from "../../models/wall/WallV2";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";

export const setRowWidthWeightsV1 = makeAggregateContractRelease(
  defineAggregateContract("setRowWidthWeights"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      wallId: modelId({ model: wallIdentity }),
      rowId: primitives.json({ schema: rowIdSchema }),
      placements: primitives.json({
        schema: Schema.Array(
          Schema.Struct({
            placementId: makeIdSchema(placementIdentity),
            widthWeight: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
          }),
        ),
      }),
    },
    models: { wall, placement, page, site, user },
    operations: { updatePlacement: placement.operations.update },
    failures: { invalidSizing: ContractError.schema({ code: "row-width-weights-invalid" }) },
    program: Effect.fn("setRowWidthWeights.program")(function* (props) {
      const { payload, claims, db, operations, failures } = props;
      if (claims === null)
        return yield* failures.invalidSizing.make({
          message: "Changing Row widths requires an authenticated user",
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
      const total = payload.placements.reduce((sum, entry) => sum + entry.widthWeight, 0);
      if (!Number.isFinite(total))
        return yield* failures.invalidSizing.make({
          message: "The Row's total weight must be finite",
          status: 400,
        });
      const requestedIds = new Set(payload.placements.map((entry) => entry.placementId));
      if (
        requestedIds.size !== payload.placements.length ||
        payload.placements.length !== row.placementIds.length ||
        row.placementIds.some((id) => !requestedIds.has(id))
      )
        return yield* failures.invalidSizing.make({
          message: "Width weights must include every current Row Placement exactly once",
          status: 409,
        });
      if (row.placementIds.length === 0) return;
      const placements = yield* findMany({
        db,
        model: db.models.placement,
        where: { wallId: { eq: wallRow.id }, id: { in: row.placementIds } },
      });
      if (placements.length !== row.placementIds.length)
        throw new Error("The Row contains a Placement missing from its Wall");
      for (const entry of payload.placements) {
        const current = placements.find((candidate) => candidate.id === entry.placementId);
        if (current === undefined) throw new Error("The validated Row Placement is missing");
        if (current.widthWeight === entry.widthWeight) continue;
        yield* operations.updatePlacement({
          resourceId: current.id,
          attributes: { widthWeight: entry.widthWeight },
        });
      }
    }),
  },
);
