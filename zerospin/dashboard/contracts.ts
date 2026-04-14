import { createResource, makeContract, primitives } from "zerospin";

import { Site } from "@/zerospin/dashboard/models";

export const createSite = makeContract({
  commandName: "createSite",
  payload: {
    id: primitives.id({ model: Site }),
    name: primitives.text(),
  },
  program: ({ payload }) => {
    const { id, name } = payload;
    return [
      createResource({
        model: Site,
        id,
        attributes: { name },
      }),
    ];
  },
  version: "1.0.0",
});
