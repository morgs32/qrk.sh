import { site as siteIdentity } from "../../models/site/site";

import {
  modelId,
  ContractError,
  findFirst,
  makeAggregateContractRelease,
} from "@zerospin/sdk/browser";

import { Effect } from "effect";

import { siteV1 as Site } from "../../models/site/SiteV1";

import { userV1 as User } from "../../models/user/UserV1";

import { unpublishSite } from "./unpublishSite";

export const unpublishSiteV1 = makeAggregateContractRelease(unpublishSite, {
  version: 1,
  payload: { siteId: modelId({ model: siteIdentity }) },
  models: {
    site: Site,
    user: User,
  },
  operations: {
    updateSite: Site.operations.update,
  },
  failures: {
    unpublishSiteUserMismatch: ContractError.schema({ code: "unpublish-site-user-mismatch" }),
    unpublishSiteNotFound: ContractError.schema({ code: "unpublish-site-not-found" }),
  },
  guard: Effect.fn("unpublishSite.guard")(function* (props) {
    const { payload, claims, failures, db } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* failures.unpublishSiteUserMismatch.make({
        message: "Unpublishing requires an authenticated user",
        status: 403,
      });
    }
    const site = yield* findFirst({
      db,
      model: db.models.site,
      where: { id: { eq: payload.siteId } },
    });
    if (site === undefined) {
      return yield* failures.unpublishSiteNotFound.make({
        message: `Site ${payload.siteId} was not found`,
        status: 404,
      });
    }
    const user =
      site.userId === null
        ? undefined
        : yield* findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });
    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.unpublishSiteUserMismatch.make({
        message: `Site ${site.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: Effect.fn("unpublishSite")(function* (props) {
    const { payload, operations } = props;
    yield* operations.updateSite({
      resourceId: payload.siteId,
      attributes: { isPublished: false },
    });
  }),
});
