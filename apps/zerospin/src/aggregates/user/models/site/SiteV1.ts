import { models, primitives } from "@zerospin/sdk/browser";

import { userV1 as User } from "../user/UserV1";

import { site } from "./site";

export const siteV1 = models.makeVersion(site, {
  attributes: {
    userId: primitives.ref({
      table: User.table,
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
  },
  indexes: [],
  version: "1.0.0",
});
