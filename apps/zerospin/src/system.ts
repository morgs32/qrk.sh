import { makeSystem } from "@zerospin/sdk";
import { userAggregateV1 } from "./fresh/userAggregateV1";
import { userAggregateV2 } from "./fresh/userAggregateV2";
import { userAggregateV3 } from "./fresh/userAggregateV3";
import { userAggregateV4 } from "./fresh/userAggregateV4";
import { domainsV1 } from "./services/domains/domainsV1";
import { usersV1 } from "./services/users/usersV1";

export const system = makeSystem({
  name: "qrk-sh",
  aggregates: {
    user: {
      releases: { 1: userAggregateV1, 2: userAggregateV2, 3: userAggregateV3, 4: userAggregateV4 },
      canonical: 1,
    },
  },
  services: {
    domains: { releases: { 1: domainsV1 }, canonical: 1 },
    users: { releases: { 1: usersV1 }, canonical: 1 },
  },
});
