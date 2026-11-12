import { makeSystem } from "@zerospin/sdk";
import { userAggregateV9 } from "./aggregates/user/UserV9";

import { userAggregateV10 } from "./aggregates/user/UserV10";

import { userAggregateV11 } from "./aggregates/user/UserV11";

import { userAggregateV12 } from "./aggregates/user/UserV12";
import { userAggregateV13 } from "./aggregates/user/UserV13";
import { userAggregateV14 } from "./aggregates/user/UserV14";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: {
        9: userAggregateV9,
        10: userAggregateV10,
        11: userAggregateV11,
        12: userAggregateV12,
        13: userAggregateV13,
        14: userAggregateV14,
      },
      canonical: 9,
    },
  },
});
