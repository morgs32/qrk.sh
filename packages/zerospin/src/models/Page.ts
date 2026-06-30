import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { Site } from "./Site";

export const Page = makeModel({
  abbreviation: "pag",
  modelName: "page",
  attributes: {
    siteId: primitives.ref({
      model: Site,
      inverse: { name: "pages", kind: "many" },
    }),
    slug: primitives.text(),
    title: primitives.text(),
    description: primitives.text({
      nullable: true,
    }),
    pageType: primitives.enum({
      values: ["split-scroll", "shared-scroll"] as const,
    }),
  },
  version: 1,
});
