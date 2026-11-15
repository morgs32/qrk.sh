import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./fresh/userAggregateV1";
import { userAggregateV2 } from "./fresh/userAggregateV2";
import { userAggregateV3 } from "./fresh/userAggregateV3";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 1: userAggregateV1, 2: userAggregateV2, 3: userAggregateV3 },
      canonical: 1,
    },
  },
});
