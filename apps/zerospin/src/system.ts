import { makeSystem } from "@zerospin/sdk";
import { userV6 } from "./aggregates/user/UserV6";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: [userV6] },
});
