import { defineService, makeServiceRelease } from "@zerospin/sdk";
import { assignDomainV1 } from "./AssignDomainV1";
import { domainV1 } from "./DomainV1";

export const domains = defineService({ name: "domains" });

export const domainsV1 = makeServiceRelease(domains, {
  version: 1,
  models: { domain: domainV1 },
  actors: {},
  system: { assignDomain: assignDomainV1 },
});
