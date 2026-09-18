import { makeSystem } from "@zerospin/core/system/makeSystem";

import { libraryAggregateV1 } from "./libraryAggregateV1";

export const librarySystem = makeSystem({
  name: "library",
  aggregates: {
    library: [libraryAggregateV1],
  },
  services: {},
});
