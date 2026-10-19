import { publishSiteV2 as publishSite } from "./contracts/publishSite/PublishSiteV2";
import { publishPageV2 as publishPage } from "./contracts/publishPage/PublishPageV2";
import { publishPageUpdatesV2 as publishPageUpdates } from "./contracts/publishPageUpdates/PublishPageUpdatesV2";
import { unpublishSiteV2 as unpublishSite } from "./contracts/unpublishSite/UnpublishSiteV2";
import { pageSnapshotV2 as PageSnapshot } from "./models/pageSnapshot/PageSnapshotV2";
import { libraryModule } from "@qrk.sh/library/libraryModule";
import { userClaims } from "../../claims";

import { createPageV3 as createPage } from "./contracts/createPage/CreatePageV3";
import { createSiteV3 as createSite } from "./contracts/createSite/CreateSiteV3";
import { updatePageSettingsV3 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV3";
import { updateSiteSettingsV3 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV3";
import { pageV3 as Page } from "./models/page/PageV3";
import { siteV3 as Site } from "./models/site/SiteV3";
import { userV1 as User } from "./models/user/UserV1";

export const userSessionDefinitionProps = {
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
  actorVersion: "3.0.0",
  aggregateVersion: "3.0.0",
  models: {
    ...libraryModule.models,
    page: Page,
    pageSnapshot: PageSnapshot,
    site: Site,
    user: User,
  },
};
