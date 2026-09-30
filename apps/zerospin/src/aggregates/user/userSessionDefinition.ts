import { libraryModule } from "@qrk.sh/library/libraryModule";
import { userClaims } from "../../claims";

import { createPageV1 as createPage } from "./contracts/createPage/CreatePageV1";
import { createSiteV1 as createSite } from "./contracts/createSite/CreateSiteV1";
import { updatePageSettingsV1 as updatePageSettings } from "./contracts/updatePageSettings/UpdatePageSettingsV1";
import { updateSiteSettingsV1 as updateSiteSettings } from "./contracts/updateSiteSettings/UpdateSiteSettingsV1";
import { pageV1 as Page } from "./models/page/PageV1";
import { siteV1 as Site } from "./models/site/SiteV1";
import { userV1 as User } from "./models/user/UserV1";

export const userSessionDefinition = {
  kind: "aggregate" as const,
  claimsSchema: userClaims,
  contracts: {
    ...libraryModule.contracts,
    createPage,
    createSite,
    updatePageSettings,
    updateSiteSettings,
  },
  aggregateName: "user",
  sessionName: "userSession",
  actorName: "web",
  actorVersion: "1.0.0",
  aggregateVersion: "1.0.0",
  models: {
    ...libraryModule.models,
    page: Page,
    site: Site,
    user: User,
  },
};
