import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { User } from "./User";

export const Site = makeModel({
  abbreviation: "sit",
  modelName: "site",
  attributes: {
    userId: primitives.ref({
      model: User,
      inverse: { name: "sites", kind: "many" },
    }),
    slug: primitives.text(),
    name: primitives.text(),
    description: primitives.text({
      nullable: true,
    }),
  },
  version: 1,
});
