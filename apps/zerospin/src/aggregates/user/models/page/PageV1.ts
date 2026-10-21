import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { site as Site } from "../site/site";

import { page } from "./page";

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
  },
  indexes: [],
  version: "1.0.0",
});
