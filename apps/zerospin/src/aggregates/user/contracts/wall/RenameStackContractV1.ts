import {
  ContractError,
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { userClaims } from "../../../../claims";
import { stackIdSchema } from "../../layout/wallLayoutSchema";
import { pageV1 as page } from "../../models/page/PageV1";
import { siteV1 as site } from "../../models/site/SiteV1";
import { userV1 as user } from "../../models/user/UserV1";
import { wallV1 as wall } from "../../models/wall/WallV1";
import { wall as wallIdentity } from "../../models/wall/wall";

export const renameStackV1 = makeAggregateContractRelease(defineAggregateContract("renameStack"), {
  version: 1,
  claims: userClaims,
  models: { page, site, user, wall },
  operations: { updateWall: wall.operations.update },
  payload: {
    wallId: modelId({ model: wallIdentity }),
    stackId: primitives.json({ schema: stackIdSchema }),
    name: primitives.text(),
  },
  failures: {
    invalidName: ContractError.schema({ code: "stack-name-invalid" }),
    notFound: ContractError.schema({ code: "rename-stack-not-found" }),
    userMismatch: ContractError.schema({ code: "rename-stack-user-mismatch" }),
  },
  program: Effect.fn("renameStack.program")(function* (props) {
    const { db, payload, operations, failures, claims } = props;
    const name = payload.name.trim();
    if (name.length === 0)
      return yield* failures.invalidName.make({ message: "Enter a Stack name", status: 400 });
    if (claims === null)
      return yield* failures.userMismatch.make({
        message: "Renaming a Stack requires an authenticated user",
        status: 403,
      });
    const wallRow = yield* findFirst({
      db,
      model: db.models.wall,
      where: { id: { eq: payload.wallId } },
    });
    const stack = wallRow?.layout.sections
      .flatMap((section) => section.stacks)
      .find((entry) => entry.id === payload.stackId);
    if (wallRow === undefined || stack === undefined)
      return yield* failures.notFound.make({
        message: "This Stack no longer belongs to this Wall",
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
        : yield* findFirst({ db, model: db.models.site, where: { id: { eq: pageRow.siteId } } });
    const userRow =
      siteRow === undefined
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: siteRow.userId } } });
    if (userRow === undefined || userRow.clerkUserId !== claims.clerkUserId)
      return yield* failures.userMismatch.make({
        message: "This Stack does not belong to the authenticated user",
        status: 403,
      });
    if (stack.name === name) return;
    yield* operations.updateWall({
      resourceId: wallRow.id,
      attributes: {
        layout: {
          sections: wallRow.layout.sections.map((section) => ({
            ...section,
            stacks: section.stacks.map((entry) =>
              entry.id === payload.stackId ? { ...entry, name } : entry,
            ),
          })),
        },
      },
    });
  }),
});
