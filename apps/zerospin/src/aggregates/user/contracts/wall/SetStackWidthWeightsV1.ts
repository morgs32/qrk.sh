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
import { sectionIdSchema, stackIdSchema } from "../../layout/wallLayoutSchema";
import { wall as wallIdentity } from "../../models/wall/wall";
import { wallV4 as wall } from "../../models/wall/WallV4";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";

export const setStackWidthWeightsV1 = makeAggregateContractRelease(
  defineAggregateContract("setStackWidthWeights"),
  {
    version: 1,
    claims: userClaims,
    payload: {
      wallId: modelId({ model: wallIdentity }),
      sectionId: primitives.json({ schema: sectionIdSchema }),
      leftStackId: primitives.json({ schema: stackIdSchema }),
      rightStackId: primitives.json({ schema: stackIdSchema }),
      leftWeight: primitives.json({
        schema: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
      }),
      rightWeight: primitives.json({
        schema: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
      }),
    },
    models: { wall, page, site, user },
    operations: { updateWall: wall.operations.update },
    failures: { invalidSizing: ContractError.schema({ code: "stack-width-weights-invalid" }) },
    program: Effect.fn("setStackWidthWeights.program")(function* (props) {
      const { payload, claims, db, operations, failures } = props;
      if (claims === null)
        return yield* failures.invalidSizing.make({
          message: "Resizing Stacks requires an authenticated user",
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
      const section = wallRow.layout.sections.find((entry) => entry.id === payload.sectionId);
      const leftIndex =
        section?.stacks.findIndex((entry) => entry.id === payload.leftStackId) ?? -1;
      if (
        section === undefined ||
        leftIndex < 0 ||
        section.stacks[leftIndex + 1]?.id !== payload.rightStackId
      )
        return yield* failures.invalidSizing.make({
          message: "The Stack divider no longer exists",
          status: 409,
        });
      const left = section.stacks[leftIndex];
      const right = section.stacks[leftIndex + 1];
      const total = section.stacks.reduce((sum, stack) => {
        if (stack.id === left.id) return sum + payload.leftWeight;
        if (stack.id === right.id) return sum + payload.rightWeight;
        return sum + (stack.widthWeight ?? 1);
      }, 0);
      if (!Number.isFinite(total))
        return yield* failures.invalidSizing.make({
          message: "The Stack weights are too large",
          status: 409,
        });
      if (
        (left.widthWeight ?? 1) === payload.leftWeight &&
        (right.widthWeight ?? 1) === payload.rightWeight
      )
        return;
      const layout = {
        sections: wallRow.layout.sections.map((entry) =>
          entry.id !== section.id
            ? entry
            : {
                ...entry,
                stacks: entry.stacks.map((stack) => {
                  if (stack.id === left.id) return { ...stack, widthWeight: payload.leftWeight };
                  if (stack.id === right.id) return { ...stack, widthWeight: payload.rightWeight };
                  return stack;
                }),
              },
        ),
      };
      yield* operations.updateWall({ resourceId: wallRow.id, attributes: { layout } });
    }),
  },
);
