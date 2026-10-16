import { libraryModule } from "@qrk.sh/library/libraryModule";
import { makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { siteV1 as Site } from "../site/SiteV1";

import { page } from "./page";

export const pageV1 = makeModelVersion(page, {
  attributes: {
    wallId: primitives.ref({
      table: libraryModule.models.wall.table,
      relation: "wall",
      inverse: "pages",
    }),
    siteId: primitives.ref({
      table: Site.table,
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
