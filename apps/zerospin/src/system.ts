import { makeSystem } from "@zerospin/sdk";
import { userAggregateV9 } from "./aggregates/user/UserV9";

import { userAggregateV10 } from "./aggregates/user/UserV10";

import { userAggregateV11 } from "./aggregates/user/UserV11";

import { userAggregateV12 } from "./aggregates/user/UserV12";
import { userAggregateV13 } from "./aggregates/user/UserV13";
import { userAggregateV14 } from "./aggregates/user/UserV14";
import { userAggregateV16 } from "./aggregates/user/UserV16";
import { userAggregateV15 } from "./aggregates/user/UserV15";
import { userAggregateV17 } from "./aggregates/user/UserV17";
import { userAggregateV18 } from "./aggregates/user/UserV18";
import { userAggregateV19 } from "./aggregates/user/UserV19";
import { userAggregateV20 } from "./aggregates/user/UserV20";

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
        16: userAggregateV16,
        17: userAggregateV17,
        18: userAggregateV18,
        19: userAggregateV19,
        20: userAggregateV20,
      },
      canonical: 9,
    },
  },
});
