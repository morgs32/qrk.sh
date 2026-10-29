import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./aggregates/user/UserV1";
import { userAggregateV2 } from "./aggregates/user/UserV2";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: { releases: { 1: userAggregateV1, 2: userAggregateV2 }, canonical: 2 },
  },
});
