import { makeSystem } from "@zerospin/sdk";
import { userAggregateV9 } from "./aggregates/user/UserV9";

import { userAggregateV10 } from "./aggregates/user/UserV10";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 9: userAggregateV9, 10: userAggregateV10 },
      canonical: 9,
    },
  },
});
