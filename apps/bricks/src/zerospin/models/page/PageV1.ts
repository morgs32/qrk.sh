import { makeModelVersion, modelId, modelRef, primitives } from "@zerospin/sdk/browser";
import { site } from "../site/site";
import { pageSnapshot } from "../pageSnapshot/pageSnapshot";
import { page } from "./page";

export const pageV1 = makeModelVersion(page, {
  version: 1,
  attributes: {
    siteId: modelRef({ model: site, relation: "site", inverse: "pages" }),
    slug: primitives.text({ nullable: true }),
    title: primitives.text({ nullable: true, defaultValue: null }),
    description: primitives.text({ nullable: true, defaultValue: null }),
    isPublished: primitives.boolean({ defaultValue: false }),
    publishedSnapshotId: modelId({ model: pageSnapshot, nullable: true }),
  },
  indexes: [],
});
