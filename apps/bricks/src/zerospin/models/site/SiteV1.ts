import { makeModelVersion, modelRef, primitives } from "@zerospin/sdk/browser";
import { user } from "../user/user";
import { site } from "./site";

export const siteV1 = makeModelVersion(site, {
  version: 1,
  attributes: {
    userId: modelRef({ model: user, relation: "user", inverse: "sites" }),
    slug: primitives.text({ nullable: true, defaultValue: null }),
    name: primitives.text({ nullable: true, defaultValue: null }),
    description: primitives.text({ nullable: true, defaultValue: null }),
    logoUrl: primitives.text({ nullable: true, defaultValue: null }),
    faviconLightUrl: primitives.text({ nullable: true, defaultValue: null }),
    faviconDarkUrl: primitives.text({ nullable: true, defaultValue: null }),
    isPublished: primitives.boolean({ defaultValue: false }),
    stickyNavbar: primitives.boolean({ defaultValue: true }),
    cardStyle: primitives.boolean({ defaultValue: false }),
    brickGap: primitives.integer({ defaultValue: 1 }),
  },
  indexes: [],
});
