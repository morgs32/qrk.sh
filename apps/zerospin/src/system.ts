import { makeSystem } from "@zerospin/sdk";
import { userV4 } from "./aggregates/user/UserV4";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: [userV4] },
});
