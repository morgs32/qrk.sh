import { makeSystem } from "@zerospin/sdk";
import { userAggregateV9 } from "./aggregates/user/UserV9";

import { userAggregateV10 } from "./aggregates/user/UserV10";

import { userAggregateV11 } from "./aggregates/user/UserV11";

import { userAggregateV12 } from "./aggregates/user/UserV12";
import { userAggregateV13 } from "./aggregates/user/UserV13";
import { userAggregateV14 } from "./aggregates/user/UserV14";
import { userAggregateV15 } from "./aggregates/user/UserV15";

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
        15: userAggregateV15,
      },
      canonical: 9,
    },
  },
});
