import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./fresh/userAggregateV1";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 1: userAggregateV1 },
      canonical: 1,
    },
  },
});
