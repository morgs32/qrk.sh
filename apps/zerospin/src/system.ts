import { makeSystem } from "@zerospin/sdk";
import { userAggregateV3 } from "./aggregates/user/UserV3";
import { userAggregateV4 } from "./aggregates/user/UserV4";
import { userAggregateV5 } from "./aggregates/user/UserV5";
import { userAggregateV6 } from "./aggregates/user/UserV6";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 3: userAggregateV3, 4: userAggregateV4, 5: userAggregateV5, 6: userAggregateV6 },
      canonical: 6,
    },
  },
});
