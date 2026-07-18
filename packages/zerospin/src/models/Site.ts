import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { User } from "./User";

export const Site = makeModel(
  {
    abbreviation: "sit",
    modelName: "site",
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
    version: "2.0.0",
  },
  [
    {
      abbreviation: "sit",
      modelName: "site",
      attributes: {
        userId: primitives.ref({
          table: User.table,
          relation: "user",
          inverse: "sites",
        }),
        slug: primitives.text(),
        name: primitives.text(),
        description: primitives.text({
          nullable: true,
        }),
      },
      indexes: [],
      version: "1.0.0",
    },
  ],
);
