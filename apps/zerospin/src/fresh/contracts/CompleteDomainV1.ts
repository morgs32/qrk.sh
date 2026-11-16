import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { siteV2 } from "@qrk.sh/bricks/zerospin/models/site/SiteV2";
import { siteFailureV1 } from "@qrk.sh/bricks/zerospin/models/siteFailure/SiteFailureV1";
import { ContractError } from "@zerospin/error";
import { findFirst, makeAggregateCommandContinuation, modelId } from "@zerospin/sdk";
import { Effect } from "effect";
import { assignDomainV1 } from "../../services/domains/AssignDomainV1";
import { recordSiteFailureV1 } from "./RecordSiteFailureV1";

export const completeDomainV1 = makeAggregateCommandContinuation({
  name: "completeDomain",
  version: 1,
  destination: assignDomainV1,
  payload: { siteId: modelId({ model: site }) },
  models: {
    site: { model: siteV2, fields: ["hostname"] },
    siteFailure: { model: siteFailureV1, fields: ["siteId", "stage", "message"] },
  },
  operations: {
    updateSite: siteV2.operations.update,
    createFailure: siteFailureV1.operations.create,
  },
  failures: { siteMissing: ContractError.schema({ code: "domain-site-missing" }) },
  onFailure: {
    contract: recordSiteFailureV1,
    payload: ({ payload, failure }) => ({ siteId: payload.siteId, message: failure.message }),
  },
  program: Effect.fn("user.completeDomain")(function* (props) {
    const { payload, outcome, db, operations, failures } = props;
    const current = yield* findFirst({
      db,
      model: db.models.site,
      where: { id: { eq: payload.siteId } },
    });
    if (current === undefined) {
      return yield* failures.siteMissing.make({ message: "Site was not found" });
    }
    if (outcome.result._tag === "Failure") {
      const id: `sfl_${string}` = `sfl_${payload.siteId}_domains`;
      const existing = yield* findFirst({
        db,
        model: db.models.siteFailure,
        where: { id: { eq: id } },
      });
      if (existing === undefined) {
        yield* operations.createFailure({
          resourceId: id,
          attributes: {
            siteId: payload.siteId,
            stage: "domains",
            message: outcome.result.failure.message,
          },
        });
      }
      return;
    }
    yield* operations.updateSite({
      resourceId: payload.siteId,
      attributes: { hostname: outcome.result.success.hostname },
    });
  }),
});
