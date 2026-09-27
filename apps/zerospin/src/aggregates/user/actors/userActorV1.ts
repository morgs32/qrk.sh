import { RoutePattern } from "@remix-run/route-pattern";
import {
  defineAggregateActor,
  makeAggregateActorVersion,
  makeActorDbVersion,
  makeActorIdentity,
  makeId,
  resolveFailure,
  ZerospinError,
} from "@zerospin/sdk";
import { Effect } from "effect";
import { userClaims } from "../../../claims";
import { signature } from "../../../signature";
import { userProvisionerV1 } from "./userProvisionerV1";
import { createGridV1 as createGrid } from "../contracts/createGrid/CreateGridV1";
import { createPageV1 as createPage } from "../contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { createUserV1 as createUser } from "../contracts/createUser/CreateUserV1";
import { updateGridV1 as updateGrid } from "../contracts/updateGrid/UpdateGridV1";
import { updatePageArticleV1 as updatePageArticle } from "../contracts/updatePageArticle/UpdatePageArticleV1";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { brickV1 as Brick } from "../models/brick/BrickV1";
import { gridV1 as Grid } from "../models/grid/GridV1";
import { pageV1 as Page } from "../models/page/PageV1";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";

const identity = makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});
const db = makeActorDbVersion({
  models: { brick: Brick, grid: Grid, page: Page, site: Site, user: User },
});

export const userActorV1 = makeAggregateActorVersion(defineAggregateActor({ name: "web" }), {
  version: "1.0.0",
  identity,
  db,
  authentication: {
    credentialsSchema: signature,
    authenticate: Effect.fn("userActor.authenticate")(function* ({ credentials, executeCommand }) {
      const authentication = userProvisionerV1.authentication;
      if (authentication === "none") {
        return yield* new ZerospinError({
          code: "user-provisioner-authentication-required",
          message: "The provisioner must authenticate Clerk credentials",
        });
      }
      const claims = yield* authentication.authenticate({ credentials, executeCommand });
      const result = yield* executeCommand({
        aggregateId: claims.aggregateId,
        actor: userProvisionerV1,
        claims,
        contract: createUser,
        payload: {
          id: yield* makeId(User),
          clerkUserId: claims.clerkUserId,
          username: null,
          displayName: null,
        },
      });
      if (result.admission.status === "failed") {
        return yield* new ZerospinError({
          code: "user-provisioning-failed",
          message: "User provisioning was not admitted",
          extra: { admission: result.admission },
        });
      }
      // Repeated authentications retain the first resource ID, including after a lost response.
      if (result.execution.status === "failed") {
        const failure = yield* resolveFailure(createUser, result.execution.failure);
        if (!("code" in failure) || failure.code !== "user-already-exists") {
          return yield* new ZerospinError({
            code: "user-provisioning-failed",
            message: "User provisioning failed",
            extra: { failure },
          });
        }
      }
      return claims;
    }),
  },
  contracts: {
    createGrid,
    createPage,
    createSite,
    updateGrid,
    updatePageArticle,
    updatePageSettings,
    updateSiteSettings,
  },
  queries: {
    brick: db.query.brick.findMany({
      where: {
        grid: {
          page: {
            site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
          },
        },
      },
    }),
    grid: db.query.grid.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
      },
    }),
    page: db.query.page.findMany({
      where: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
    }),
    site: db.query.site.findMany({
      where: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
    }),
    user: db.query.user.findMany({
      where: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } },
    }),
  },
});
