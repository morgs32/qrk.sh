import { usernameStatusV1 } from "@qrk.sh/bricks/zerospin/models/usernameStatus/UsernameStatusV1";
import { siteFailureV1 } from "@qrk.sh/bricks/zerospin/models/siteFailure/SiteFailureV1";
import { siteV2 } from "@qrk.sh/bricks/zerospin/models/site/SiteV2";
import { makeQueryDbVersion, updateAggregateActorRelease } from "@zerospin/sdk";
import { sql } from "drizzle-orm";
import { requestUsernameV1 } from "./contracts/RequestUsernameV1";
import { createSiteV2 } from "./contracts/CreateSiteV2";
import { publishSiteV2 } from "./contracts/PublishSiteV2";
import { unpublishSiteV2 } from "./contracts/UnpublishSiteV2";
import { updateSiteSettingsV2 } from "./contracts/UpdateSiteSettingsV2";
import { userActorV2 } from "./userActorV2";

const db = makeQueryDbVersion({
  models: {
    ...userActorV2.db.models,
    site: siteV2,
    usernameStatus: usernameStatusV1,
    siteFailure: siteFailureV1,
  },
});

export const userActorV3 = updateAggregateActorRelease(userActorV2, {
  version: 3,
  db,
  exposedModels: {
    ...userActorV2.exposedModels,
    site: siteV2,
    usernameStatus: usernameStatusV1,
    siteFailure: siteFailureV1,
  },
  contracts: {
    requestUsername: requestUsernameV1,
    createSite: createSiteV2,
    publishSite: publishSiteV2,
    unpublishSite: unpublishSiteV2,
    updateSiteSettings: updateSiteSettingsV2,
  },
  selections: {
    wall: db.query.wall.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } } } },
      },
    }),
    brick: db.query.brick.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } } } },
      },
    }),
    placement: db.query.placement.findMany({
      where: {
        wall: {
          page: { site: { user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } } } },
        },
      },
    }),
    page: db.query.page.findMany({
      where: {
        site: { user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } } },
      },
    }),
    site: db.query.site.findMany({
      where: {
        user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } },
      },
    }),
    user: db.query.user.findMany({
      where: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } },
    }),
    pageSnapshot: db.query.pageSnapshot.findMany({
      where: {
        page: { site: { user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } } } },
        RAW: (snapshot) =>
          sql`exists (select 1 from ${db.config.schema.page} where ${db.config.schema.page.id} = ${snapshot.pageId} and ${db.config.schema.page.publishedSnapshotId} = ${snapshot.id})`,
      },
    }),
    siteFailure: db.query.siteFailure.findMany({
      where: {
        site: {
          user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } },
        },
      },
    }),
    usernameStatus: db.query.usernameStatus.findMany({
      where: {
        user: { clerkUserId: { eq: userActorV2.identity.sql.placeholder("clerkUserId") } },
      },
    }),
  },
});
