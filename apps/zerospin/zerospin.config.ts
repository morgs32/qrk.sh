import { makeConfig } from "@zerospin/sdk";

import { system } from "./src/system";

export const ownerReleaseSources = {
  aggregates: {
    user: {
      1: { module: "./src/fresh/userAggregateV1.ts", export: "userAggregateV1" },
    },
  },
  services: {
    assets: {
      1: { module: "./src/services/assets/assetsV1.ts", export: "assetsV1" },
    },
    domains: {
      1: { module: "./src/services/domains/domainsV1.ts", export: "domainsV1" },
    },
    users: {
      1: { module: "./src/services/users/usersV1.ts", export: "usersV1" },
    },
  },
};

export default makeConfig({ system, systemId: "sys_qrk_sh_1" });
