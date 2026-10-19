import { findFirst, upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";
import { unpublishSiteV1 } from "./UnpublishSiteV1";

export const unpublishSiteV2 = upgradeAggregateContractVersion(unpublishSiteV1, {
  version: "2.0.0",
  payload: {},
  up: Effect.fn("unpublishSiteV2.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("unpublishSiteV2.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { site: Site, user: User },
  operations: { updateSite: Site.operations.update },
  guard: Effect.fn("unpublishSiteV2.guard")(function* (props) {
    const { payload, claims, failures, db } = props;
    const clerkUserId = claims?.clerkUserId;
    if (typeof clerkUserId !== "string") {
      return yield* failures.unpublishSiteUserMismatch.make({
        message: "Unpublishing requires an authenticated user",
        status: 403,
      });
    }
    const site = yield* findFirst({ db, model: Site, where: { id: { eq: payload.siteId } } });
    if (site === undefined) {
      return yield* failures.unpublishSiteNotFound.make({
        message: `Site ${payload.siteId} was not found`,
        status: 404,
      });
    }
    const user =
      site.userId === null
        ? undefined
        : yield* findFirst({ db, model: User, where: { id: { eq: site.userId } } });
    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.unpublishSiteUserMismatch.make({
        message: `Site ${site.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: Effect.fn("unpublishSiteV2")(function* (props) {
    const { payload, operations } = props;
    yield* operations.updateSite({
      resourceId: payload.siteId,
      attributes: { isPublished: false },
    });
  }),
});
