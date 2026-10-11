import { Effect } from "effect";
import { findFirst } from "@zerospin/sdk/browser";
import { scopeContractReadDb } from "@zerospin/core/contracts/make/makeContractReadDb";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { makeAggregateRelease } from "@zerospin/sdk";
import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { createUserV1 as createUser } from "./contracts/createUser/CreateUserV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";
import { user } from "./user";
import { userActorV1 } from "./actors/userActorV1";
import { userProvisionerV1 } from "./actors/userProvisionerV1";

export const userAggregateV1 = makeAggregateRelease(user, {
  version: "1.0.0",
  models: {
    ...libraryModule.models,
    page: Page,
    site: Site,
    user: User,
  },
  contracts: {
    ...libraryModule.contracts,
    createPage: createPage,
    createSite: createSite,
    createUser: createUser,
    updatePageSettings: updatePageSettings,
    updateSiteSettings: updateSiteSettings,
  },
  actors: { web: userActorV1, provisioner: userProvisionerV1 },
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
