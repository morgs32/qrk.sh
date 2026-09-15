import { makeSystem } from "@zerospin/sdk";
import { userV7 } from "./aggregates/user/UserV7";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: [userV7] },
});
