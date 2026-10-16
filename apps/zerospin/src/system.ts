import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./aggregates/user/UserV1";
import { userAggregateV2 } from "./aggregates/user/UserV2";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: { "1.0.0": userAggregateV1, "2.0.0": userAggregateV2 } },
});
