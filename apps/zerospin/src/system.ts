import { makeSystem } from "@zerospin/sdk";
import { userAggregateV3 } from "./aggregates/user/UserV3";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: { releases: { 3: userAggregateV3 }, canonical: 3 },
  },
});
