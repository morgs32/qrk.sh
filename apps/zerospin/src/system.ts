import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./aggregates/user/UserV1";

export const system = makeSystem({ name: "qrk-sh", aggregates: { user: { 1: userAggregateV1 } } });
