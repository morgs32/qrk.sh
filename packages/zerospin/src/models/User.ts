import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

export const User = makeModel({
  abbreviation: "usr",
  modelName: "user",
  attributes: {
    actorId: primitives.id({
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
  version: 1,
});
