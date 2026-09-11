import { models, primitives } from "@zerospin/sdk/browser";

import { user } from "./user";

export const userV1 = models.makeVersion(user, {
  attributes: {
    actorId: primitives.foreignKey({
      abbreviation: "actr",
      unique: true,
    }),
    clerkUserId: primitives.text({
      unique: true,
    }),
    username: primitives.text({
      nullable: true,
      unique: true,
    }),
    displayName: primitives.text({
      nullable: true,
    }),
  },
  indexes: [],
  version: "1.0.0",
});
