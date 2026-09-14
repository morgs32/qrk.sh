import { makeSystem } from "@zerospin/sdk";
import { userV5 } from "./aggregates/user/UserV5";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: [userV5] },
});
