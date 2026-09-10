import { models, primitives } from "@zerospin/sdk/browser";

import { Site } from "./Site";

export const Page = models.makeVersion(models.makeModel({ name: "page", abbreviation: "pag" }), {
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
  },
  indexes: [],
  version: "1.0.0",
});
