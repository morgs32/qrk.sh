import { models, primitives } from "@zerospin/sdk/browser";

export const User = models.makeVersion(models.makeModel({ name: "user", abbreviation: "usr" }), {
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
