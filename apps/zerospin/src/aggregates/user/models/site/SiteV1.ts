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
  },
  indexes: [],
  version: "1.0.0",
});
