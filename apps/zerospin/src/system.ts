import { makeSystem } from "@zerospin/sdk";
import { userV8 } from "./aggregates/user/UserV8";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: [userV8] },
});
