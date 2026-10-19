import { publishSiteV2 as publishSite } from "./contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "./contracts/publishPage/PublishPageV2";
import { publishPageUpdatesV2 as publishPageUpdates } from "./contracts/publishPageUpdates/PublishPageUpdatesV2";
import { unpublishSiteV2 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV2";
import { pageSnapshotV2 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV2";
import { Effect } from "effect";
import { findFirst } from "@zerospin/sdk/browser";
import { scopeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { makeAggregateRelease } from "@zerospin/sdk";
import { createPageV3 as createPage } from "./contracts/createPage/CreatePageV3";
import { createSiteV3 as createSite } from "./contracts/createSite/CreateSiteV3";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updatePageSettingsV3 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV3";
import { updateSiteSettingsV3 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { pageV3 as Page } from "./models/page/PageV3";
import { siteV3 as Site } from "./models/site/SiteV3";
import { userV1 as User } from "./models/user/UserV1";
import { user } from "./user";
import { userActorV3 } from "./actors/userActorV3";
import { userProvisionerV1 } from "./actors/userProvisionerV1";

export const userAggregateV3 = makeAggregateRelease(user, {
  version: "3.0.0",
  models: {
    ...libraryModule.models,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
  contracts: {
    ...libraryModule.contracts,
    publishSite,
    publishPage,
    publishPageUpdates,
    unpublishSite,
    createPage,
    createSite,
    createUser,
    updatePageSettings,
    updateSiteSettings,
  },
  actors: { web: userActorV3, provisioner: userProvisionerV1 },
  guards: {
    provisioner: {
      createUser: (props) => {
        const { db, claims, payload, failures } = props;
        return Effect.gen(function* () {
          if (payload.clerkUserId !== claims.clerkUserId) {
            return yield* failures.createUserIdentityMismatch.make({
              message: `User ${payload.id} does not match authenticated identity ${claims.clerkUserId}`,
              status: 403,
            });
          }
          const existingUser = yield* findFirst({
            db: scopeContractReadDb(db, createUser.models),
            model: User,
            where: { clerkUserId: { eq: payload.clerkUserId } },
          });
          if (existingUser !== undefined) {
            return yield* failures.userAlreadyExists.make({
              message: `A user already exists for Clerk user ${payload.clerkUserId}`,
              status: 409,
            });
          }
        });
      },
    },
  },
});
