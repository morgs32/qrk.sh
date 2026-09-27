import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { TiptapDocSchema } from "@qrk.sh/library/TiptapDocSchema";

import { siteV1 as Site } from "../site/SiteV1";

import { page } from "./page";

export const pageV1 = makeModelVersion(page, {
  attributes: {
    siteId: primitives.ref({
      table: Site.table,
      relation: "site",
      inverse: "pages",
    }),
    slug: primitives.text(),
    title: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    description: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    pageType: primitives.enum({
      values: ["split-scroll", "shared-scroll"],
    }),
    article: primitives.json({
      nullable: true,
      defaultValue: null,
      schema: TiptapDocSchema,
    }),
  },
  indexes: [],
  version: "1.0.0",
});
