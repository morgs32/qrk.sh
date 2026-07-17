import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { Site } from "./Site";

export const Page = makeModel(
  {
    abbreviation: "pag",
    modelName: "page",
    attributes: {
      siteId: primitives.ref({
        table: Site.table,
        relation: "site",
        inverse: "pages",
      }),
      slug: primitives.text(),
      title: primitives.text(),
      description: primitives.text({
        nullable: true,
      }),
      pageType: primitives.enum({
        values: ["split-scroll", "shared-scroll"],
      }),
    },
    indexes: [],
    version: "1.0.0",
  },
  [],
);
