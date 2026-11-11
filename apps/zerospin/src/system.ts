import { makeSystem } from "@zerospin/sdk";
import { userAggregateV9 } from "./aggregates/user/UserV9";

import { userAggregateV10 } from "./aggregates/user/UserV10";

import { userAggregateV11 } from "./aggregates/user/UserV11";

import { userAggregateV12 } from "./aggregates/user/UserV12";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 9: userAggregateV9, 10: userAggregateV10, 11: userAggregateV11, 12: userAggregateV12 },
      canonical: 9,
    },
  },
});
