import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./fresh/userAggregateV1";
import { assetsV1 } from "./services/assets/assetsV1";
import { domainsV1 } from "./services/domains/domainsV1";
import { usersV1 } from "./services/users/usersV1";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: { user: { releases: { 1: userAggregateV1 }, canonical: 1 } },
  services: {
    assets: { releases: { 1: assetsV1 }, canonical: 1 },
    domains: { releases: { 1: domainsV1 }, canonical: 1 },
    users: { releases: { 1: usersV1 }, canonical: 1 },
  },
});
