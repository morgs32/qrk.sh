import { usernameStatusV1 } from "@qrk.sh/bricks/zerospin/models/usernameStatus/UsernameStatusV1";
import { siteFailureV1 } from "@qrk.sh/bricks/zerospin/models/siteFailure/SiteFailureV1";
import { siteV2 } from "@qrk.sh/bricks/zerospin/models/site/SiteV2";
import { findFirst, makeAggregateRelease } from "@zerospin/sdk";
import { Effect } from "effect";
import { userActorV3 } from "./userActorV3";
import { userAggregateV3 } from "./userAggregateV3";
import { userAggregate } from "./userAggregate";
import { assignUsernameV1 } from "./contracts/AssignUsernameV1";
import { completeUsernameV1 } from "./contracts/CompleteUsernameV1";
import { requestUsernameExtensionV1 } from "./contracts/RequestUsernameExtensionV1";
import { completeDomainV1 } from "./contracts/CompleteDomainV1";
import { createSiteExtensionV2 } from "./contracts/CreateSiteExtensionV2";
import { recordSiteFailureV1 } from "./contracts/RecordSiteFailureV1";

const createPageGuard = userAggregateV3.guards.web?.createPage;
if (createPageGuard === undefined) throw new Error("User V3 must provide its Page path guard");

export const userAggregateV4 = makeAggregateRelease(userAggregate, {
  version: 4,
  models: {
    ...userAggregateV3.models,
    site: siteV2,
    usernameStatus: usernameStatusV1,
    siteFailure: siteFailureV1,
  },
  system: { ...userAggregateV3.system, assignUsername: assignUsernameV1 },
  continuations: {
    completeUsername: completeUsernameV1,
    completeDomain: completeDomainV1,
    recordSiteFailure: recordSiteFailureV1,
  },
  extensions: {
    requestUsername: requestUsernameExtensionV1,
    createSite: createSiteExtensionV2,
  },
  external: userAggregateV3.external,
  actors: { web: userActorV3 },
  guards: {
    web: {
      createPage: createPageGuard,
      publishSite: Effect.fn("userV4.publishSite.guard")(function* (props) {
        const { db, claims, failures } = props;
        const user = yield* findFirst({
          db,
          model: db.models.user,
          where: { clerkUserId: { eq: claims.clerkUserId } },
        });
        if (user === undefined || user.username === null || user.username === "") {
          return yield* failures.usernameRequired.make({
            message: "Save a username before publishing",
            status: 403,
          });
        }
        const status = yield* findFirst({
          db,
          model: db.models.usernameStatus,
          where: { userId: { eq: user.id } },
        });
        if (status?.pending !== null && status?.pending !== undefined) {
          return yield* failures.usernameRequired.make({
            message: "Wait for your username to be saved",
            status: 409,
          });
        }
      }),
    },
  },
});
