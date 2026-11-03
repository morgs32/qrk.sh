import { makeSystem } from "@zerospin/sdk";
import { userAggregateV9 } from "./aggregates/user/UserV9";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 9: userAggregateV9 },
      canonical: 9,
    },
  },
});
