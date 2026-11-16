import { makeModelVersion, modelRef, primitives } from "@zerospin/sdk/browser";
import { site } from "../site/site";
import { siteFailure } from "./siteFailure";

export const siteFailureV1 = makeModelVersion(siteFailure, {
  version: 1,
  attributes: {
    siteId: modelRef({ model: site, relation: "site", inverse: "failures" }),
    stage: primitives.enum({ values: ["domains", "continuation"] }),
    message: primitives.text(),
  },
  indexes: [],
});
