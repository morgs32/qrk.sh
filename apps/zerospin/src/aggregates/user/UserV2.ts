import { publishSiteV1 as publishSite } from "./contracts/publishSite/PublishSiteV1";
import { publishPageV1 as publishPage } from "./contracts/publishPage/PublishPageV1";
import { publishPageUpdatesV1 as publishPageUpdates } from "./contracts/publishPageUpdates/PublishPageUpdatesV1";
import { unpublishSiteV1 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV1";
import { pageSnapshotV1 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV1";
import { Effect } from "effect";
import { findFirst } from "@zerospin/sdk/browser";
import { scopeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { makeAggregateRelease } from "@zerospin/sdk";
import { createPageV2 as createPage } from "./contracts/createPage/CreatePageV2";
import { createSiteV2 as createSite } from "./contracts/createSite/CreateSiteV2";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updatePageSettingsV2 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV2";
import { updateSiteSettingsV2 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV2";
import { pageV2 as Page } from "./models/page/PageV2";
import { siteV2 as Site } from "./models/site/SiteV2";
import { userV1 as User } from "./models/user/UserV1";
import { user } from "./user";
import { userActorV2 } from "./actors/userActorV2";
import { userProvisionerV1 } from "./actors/userProvisionerV1";

export const userAggregateV2 = makeAggregateRelease(user, {
  version: "2.0.0",
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
    createPage: createPage,
    createSite: createSite,
    createUser: createUser,
    updatePageSettings: updatePageSettings,
    updateSiteSettings: updateSiteSettings,
  },
  actors: { web: userActorV2, provisioner: userProvisionerV1 },
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
