import { makeSession } from "@zerospin/browser";
import { PublishableKey } from "@zerospin/core/services/PublishableKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { Layer, Redacted } from "effect";
import { userSessionDefinition } from "@qrk.sh/zerospin/src/aggregates/user/userSessionDefinition";
import { signature } from "@qrk.sh/zerospin/src/signature";

const apiUrl = process.env.NEXT_PUBLIC_ZEROSPIN_API_URL;
const publishableKey = process.env.NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY;
if (!apiUrl) throw new Error("NEXT_PUBLIC_ZEROSPIN_API_URL is required for the app.");
if (!publishableKey)
  throw new Error("NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY is required for the app.");

export const userSession = makeSession({
  kind: "aggregate",
  systemName: "qrk-sh",
  aggregateName: "user",
  aggregateVersion: "1.0.0",
  actorName: "web",
  actorVersion: "1.0.0",
  sessionName: "userSession",
  identitySchema: userSessionDefinition.identity.identitySchema,
  credentialsSchema: signature,
  models: userSessionDefinition.models,
  contracts: {
    createGrid: userSessionDefinition.contracts.createGrid.contract,
    createPage: userSessionDefinition.contracts.createPage.contract,
    createSite: userSessionDefinition.contracts.createSite.contract,
    updateGrid: userSessionDefinition.contracts.updateGrid.contract,
    updatePageArticle: userSessionDefinition.contracts.updatePageArticle.contract,
    updatePageSettings: userSessionDefinition.contracts.updatePageSettings.contract,
    updateSiteSettings: userSessionDefinition.contracts.updateSiteSettings.contract,
  },
  layer: Layer.mergeAll(
    Layer.succeed(ZerospinApiUrl, apiUrl),
    Layer.succeed(PublishableKey, Redacted.make(publishableKey)),
  ),
});
