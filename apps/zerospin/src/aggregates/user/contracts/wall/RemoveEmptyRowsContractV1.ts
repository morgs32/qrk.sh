import {
  ContractError,
  defineAggregateContract,
  makeAggregateContractVersion,
  findFirst,
  findMany,
  primitives,
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
import { placementV1 as placement } from "../../models/placement/PlacementV1";

export const removeEmptyRows = makeAggregateContractVersion(
  defineAggregateContract("removeEmptyRows"),
  {
    version: "1.0.0",
    models: { page, site, user, wall, section, stack, row, placement },
    claims: userClaims,
    operations: {
      deleteRow: row.operations.delete,
      updateRow: row.operations.update,
    },
    payload: { pageId: primitives.foreignKey({ abbreviation: "pag" }) },
    failures: { invalidLayout: ContractError.schema({ code: "remove-empty-rows-invalid-layout" }) },
    program: Effect.fn("removeEmptyRows.program")(function* (props) {
      const { db, payload, operations, failures, claims } = props;
      const pageRow = yield* findFirst({ db, model: page, where: { id: { eq: payload.pageId } } });
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
      const stacks = yield* findMany({
        db,
        model: stack,
        where: { section: { wall: { pageId: { eq: payload.pageId } } } },
        with: { rows: { orderBy: { position: "asc" }, with: { placements: true } } },
      });
      for (const stackRow of stacks) {
        let position = 0;
        for (const entry of stackRow.rows) {
          if (entry.placements.length === 0) {
            yield* operations.deleteRow({ resourceId: entry.id });
          } else {
            if (entry.position !== position)
              yield* operations.updateRow({ resourceId: entry.id, attributes: { position } });
            position++;
          }
        }
      }
    }),
  },
);
