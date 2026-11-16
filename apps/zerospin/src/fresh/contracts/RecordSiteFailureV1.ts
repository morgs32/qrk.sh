import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { siteFailureV1 } from "@qrk.sh/bricks/zerospin/models/siteFailure/SiteFailureV1";
import {
  defineAggregateContract,
  findFirst,
  makeAggregateContractRelease,
  modelId,
  primitives,
} from "@zerospin/sdk";
import { Effect } from "effect";

export const recordSiteFailureV1 = makeAggregateContractRelease(
  defineAggregateContract("recordSiteFailure"),
  {
    version: 1,
    payload: {
      siteId: modelId({ model: site }),
      message: primitives.text(),
    },
    models: { siteFailure: { model: siteFailureV1, fields: ["siteId", "stage", "message"] } },
    operations: { create: siteFailureV1.operations.create },
    failures: {},
    program: Effect.fn("user.recordSiteFailure")(function* (props) {
      const { payload, db, operations } = props;
      const id: `sfl_${string}` = `sfl_${payload.siteId}_continuation`;
      const existing = yield* findFirst({
        db,
        model: db.models.siteFailure,
        where: { id: { eq: id } },
      });
      if (existing !== undefined) return;
      yield* operations.create({
        resourceId: id,
        attributes: {
          siteId: payload.siteId,
          stage: "continuation",
          message: payload.message,
        },
      });
    }),
  },
);
