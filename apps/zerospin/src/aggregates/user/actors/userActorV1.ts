import { Effect } from "effect";
import type { CuidFactory } from "@zerospin/shapes";
import type { IAnyError } from "@zerospin/error";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { RoutePattern } from "@remix-run/route-pattern";
import {
  defineAggregateActor,
  makeAggregateActorVersion,
  makeQueryDbVersion,
  makeActorIdentity,
} from "@zerospin/sdk";
import { userClaims } from "../../../claims";
import { signature } from "../../../signature";
import { userProvisionerV1 } from "./userProvisionerV1";
import { createPageV1 as createPage } from "../contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "../contracts/createSite/CreateSiteV1";
import { provisionAuthenticatedUser } from "./provisionAuthenticatedUser";
import { updatePageSettingsV1 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { pageV1 as Page } from "../models/page/PageV1";
import { siteV1 as Site } from "../models/site/SiteV1";
import { userV1 as User } from "../models/user/UserV1";

const identity = makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});
const db = makeQueryDbVersion({
  models: { ...libraryModule.models, page: Page, site: Site, user: User },
});

export const userActorV1 = makeAggregateActorVersion(defineAggregateActor({ name: "web" }), {
  version: "1.0.0",
  identity,
  db,
  authentication: {
    credentialsSchema: signature,
    authenticate: (props) => {
      const { aggregateId, credentials } = props;
      return userProvisionerV1.authentication.authenticate({ aggregateId, credentials });
    },
  },
  authorize: Effect.fn("userActor.authorize")(function* (props): Effect.fn.Return<
    void,
    IAnyError,
    CuidFactory
  > {
    const { aggregateId, claims } = props;
    const { default: config } = yield* Effect.promise(() => import("config"));
    const { AggregateChain } = yield* Effect.promise(() => import("system-worker"));
    const chain = yield* AggregateChain.getRepo({
      key: { systemId: config.systemId, aggregateId, aggregateName: "user" },
    });
    yield* provisionAuthenticatedUser({
      chain,
      systemName: config.system.name,
      aggregateId,
      claims,
    });
  }),

  contracts: {
    ...libraryModule.contracts,
    createPage,
    createSite,
    updatePageSettings,
    updateSiteSettings,
  },
  selections: {
    wall: db.query.wall.findMany({
      where: {
        pages: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
      },
    }),
    brick: db.query.brick.findMany({
      where: {
        wall: {
          pages: {
            site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
          },
        },
      },
    }),
    placement: db.query.placement.findMany({
      where: {
        brick: {
          wall: {
            pages: {
              site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } },
            },
          },
        },
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
