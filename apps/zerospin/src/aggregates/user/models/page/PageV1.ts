import { modelRef, makeModelVersion, primitives, modelId } from "@zerospin/sdk/browser";

import { site as Site } from "../site/site";

import { page } from "./page";

import { pageSnapshot } from "../pageSnapshot/pageSnapshot";

export const pageV1 = makeModelVersion(page, {
  attributes: {
    siteId: modelRef({
      model: Site,
      relation: "site",
      inverse: "pages",
    }),
    slug: primitives.text({ nullable: true }),
    title: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    description: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    isPublished: primitives.boolean({ defaultValue: false }),
    publishedSnapshotId: modelId({
      model: pageSnapshot,
      nullable: true,
    }),
  },
  indexes: [],
  version: 1,
});
