import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { user as User } from "../user/user";

import { site } from "./site";

export const siteV1 = makeModelVersion(site, {
  attributes: {
    userId: modelRef({
      model: User,
      relation: "user",
      inverse: "sites",
    }),
    slug: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    name: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    description: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    logoUrl: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    faviconLightUrl: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    faviconDarkUrl: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    isPublished: primitives.boolean({ defaultValue: false }),
    stickyNavbar: primitives.boolean({ defaultValue: true }),
    cardStyle: primitives.boolean({ defaultValue: false }),
    brickGap: primitives.integer({ defaultValue: 1 }),
  },
  indexes: [],
  version: 1,
});
