import { makeSystem } from "@zerospin/sdk";
import { userAggregateV3 } from "./aggregates/user/UserV3";
import { userAggregateV4 } from "./aggregates/user/UserV4";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: { releases: { 3: userAggregateV3, 4: userAggregateV4 }, canonical: 4 },
  },
});
