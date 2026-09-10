import { models, primitives } from "@zerospin/sdk/browser";

import { User } from "./User";

export const Site = models.makeVersion(models.makeModel({ name: "site", abbreviation: "sit" }), {
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
