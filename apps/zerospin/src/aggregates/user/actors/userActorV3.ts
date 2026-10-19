import { sql } from "drizzle-orm";
import { publishSiteV2 as publishSite } from "../contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "../contracts/publishPage/PublishPageV2";
import { publishPageUpdatesV2 as publishPageUpdates } from "../contracts/publishPageUpdates/PublishPageUpdatesV2";
import { unpublishSiteV2 as unpublishSite } from "../contracts/unpublishSite/UnpublishSiteV2";
import { pageSnapshotV2 as PageSnapshot } from "../models/pageSnapshot/PageSnapshotV2";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { makeQueryDbVersion, updateAggregateActorVersion } from "@zerospin/sdk";
import { createPageV3 as createPage } from "../contracts/createPage/CreatePageV3";
import { createSiteV3 as createSite } from "../contracts/createSite/CreateSiteV3";
import { updatePageSettingsV3 as updatePageSettings } from "../contracts/updatePageSettings/UpdatePageSettingsV3";
import { updateSiteSettingsV3 as updateSiteSettings } from "../contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { pageV3 as Page } from "../models/page/PageV3";
import { siteV3 as Site } from "../models/site/SiteV3";
import { userV1 as User } from "../models/user/UserV1";
import { userActorV2 } from "./userActorV2";

const identity = userActorV2.identity;

const db = makeQueryDbVersion({
  models: {
    ...libraryModule.models,
    page: Page,
    site: Site,
    user: User,
    pageSnapshot: PageSnapshot,
  },
});

export const userActorV3 = updateAggregateActorVersion(userActorV2, {
  version: "3.0.0",
  db,
  exposedModels: {
    ...libraryModule.models,
    page: Page,
    site: Site,
    user: User,
    pageSnapshot: PageSnapshot,
  },
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
