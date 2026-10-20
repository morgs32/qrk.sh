import { makeSystem } from "@zerospin/sdk";
import { userAggregateV3 } from "./aggregates/user/UserV3";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: { "3.0.0": userAggregateV3 } },
});
