import { publishSiteV1 as publishSite } from "./contracts/publishSite/PublishSiteV1";
import { publishPageV1 as publishPage } from "./contracts/publishPage/PublishPageV1";
import { publishPageUpdatesV1 as publishPageUpdates } from "./contracts/publishPageUpdates/PublishPageUpdatesV1";
import { unpublishSiteV1 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV1";
import { pageSnapshotV1 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV1";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { userClaims } from "../../claims";

import { createPageV2 as createPage } from "./contracts/createPage/CreatePageV2";
import { createSiteV2 as createSite } from "./contracts/createSite/CreateSiteV2";
import { updatePageSettingsV2 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV2";
import { updateSiteSettingsV2 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV2";
import { pageV2 as Page } from "./models/page/PageV2";
import { siteV2 as Site } from "./models/site/SiteV2";
import { userV1 as User } from "./models/user/UserV1";

export const userSessionDefinition = {
  kind: "aggregate" as const,
  claimsSchema: userClaims,
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
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: "2.0.0",
  aggregateVersion: "2.0.0",
  models: {
    ...libraryModule.models,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
};
