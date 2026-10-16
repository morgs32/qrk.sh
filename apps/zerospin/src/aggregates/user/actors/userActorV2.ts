import { sql } from "drizzle-orm";
import { publishSiteV1 as publishSite } from "../contracts/publishSite/PublishSiteV1";
import { publishPageV1 as publishPage } from "../contracts/publishPage/PublishPageV1";
import { publishPageUpdatesV1 as publishPageUpdates } from "../contracts/publishPageUpdates/PublishPageUpdatesV1";
import { unpublishSiteV1 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV1";
import { pageSnapshotV1 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV1";
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
import { createPageV2 as createPage } from "../contracts/createPage/CreatePageV2";
import { createSiteV2 as createSite } from "../contracts/createSite/CreateSiteV2";
import { provisionAuthenticatedUser } from "./provisionAuthenticatedUser";
import { updatePageSettingsV2 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV2";
import { updateSiteSettingsV2 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV2";
import { pageV2 as Page } from "../models/page/PageV2";
import { siteV2 as Site } from "../models/site/SiteV2";
import { userV1 as User } from "../models/user/UserV1";

const identity = makeActorIdentity({
  claims: userClaims,
  actorPath: RoutePattern.parse("/:clerkUserId"),
});
const db = makeQueryDbVersion({
  models: {
    ...libraryModule.models,
    page: Page,
    site: Site,
    user: User,
    pageSnapshot: PageSnapshot,
  },
});

export const userActorV2 = makeAggregateActorVersion(defineAggregateActor({ name: "web" }), {
  version: "2.0.0",
  identity,
  db,
  models: {
    ...libraryModule.models,
    page: Page,
    site: Site,
    user: User,
    pageSnapshot: PageSnapshot,
  },
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
    publishSite,
    publishPage,
    publishPageUpdates,
    unpublishSite,
    createPage,
    createSite,
    updatePageSettings,
    updateSiteSettings,
  },
  selections: {
    pageSnapshot: db.query.pageSnapshot.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: identity.sql.placeholder("clerkUserId") } } } },
        RAW: (snapshot) => sql`exists (
          select 1 from ${db.config.schema.page}
          where ${db.config.schema.page.id} = ${snapshot.pageId}
            and ${db.config.schema.page.publishedSnapshotId} = ${snapshot.id}
        )`,
      },
    }),
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
