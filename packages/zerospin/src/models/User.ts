import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

export const User = makeModel(
  {
    abbreviation: "usr",
    modelName: "user",
    attributes: {
      actorId: primitives.opaqueId({
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
  },
  [],
);
