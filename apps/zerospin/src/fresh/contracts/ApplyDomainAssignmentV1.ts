import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { ContractError } from "@zerospin/error";
import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { siteV1 } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { siteFailureV1 } from "@qrk.sh/bricks/zerospin/models/siteFailure/SiteFailureV1";
import {
  defineAggregateContract,
  makeAggregateContractRelease,
  findFirst,
  modelId,
  primitives,
} from "@zerospin/sdk";
import * as Effect from "effect/Effect";

export const applyDomainAssignmentV1 = makeAggregateContractRelease(
  defineAggregateContract("applyDomainAssignment"),
  {
    version: 1,
    payload: {
      siteId: modelId({ model: site }),
      userId: modelId({ model: user }),
      hostname: primitives.text({ nullable: true }),
      message: primitives.text({ nullable: true }),
    },
    models: {
      site: { model: siteV1, fields: ["userId", "hostname"] },
      siteFailure: { model: siteFailureV1, fields: ["siteId"] },
    },
    operations: {
      updateSite: siteV1.operations.update,
      createFailure: siteFailureV1.operations.create,
    },
    failures: { siteMissing: ContractError.schema({ code: "domain-site-missing" }) },
    program: Effect.fn("user.applyDomainAssignmentV1")(function* (props) {
      const { payload, db, operations, failures } = props;
      const current = yield* findFirst({
        db,
        model: db.models.site,
        where: { id: { eq: payload.siteId } },
      });
      if (current === undefined || current.userId !== payload.userId)
        return yield* failures.siteMissing.make({ message: "Site owner was not found" });
      if (payload.message !== null) {
        const id: `sfl_${string}` = `sfl_${payload.siteId}_domains`;
        const existing = yield* findFirst({
          db,
          model: db.models.siteFailure,
          where: { id: { eq: id } },
        });
        if (existing === undefined)
          yield* operations.createFailure({
            resourceId: id,
            attributes: { siteId: payload.siteId, stage: "domains", message: payload.message },
          });
        return;
      }
      if (payload.hostname === null)
        return yield* failures.siteMissing.make({ message: "Assigned hostname is missing" });
      if (current.hostname !== null && current.hostname !== payload.hostname)
        return yield* failures.siteMissing.make({
          message: "Site already has a different hostname",
        });
      yield* operations.updateSite({
        resourceId: payload.siteId,
        attributes: { hostname: payload.hostname },
      });
    }),
  },
);
