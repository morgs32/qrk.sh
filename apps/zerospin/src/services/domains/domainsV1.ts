import { defineService, makeServiceRelease } from "@zerospin/sdk";
export const domains = defineService({ name: "domains" });
import { domainV1 } from "./DomainV1";
import { assignDomainV1 } from "./AssignDomainV1";
import { lookupUsernameV1 } from "./LookupUsernameV1";
import { completeDomainLookupV1 } from "./CompleteDomainLookupV1";
import { recordDomainLookupFailureV1 } from "./RecordDomainLookupFailureV1";

export const domainsV1 = makeServiceRelease(domains, {
  version: 1,
  models: { domain: domainV1 },
  actors: {},
  system: { assignDomain: assignDomainV1 },
  external: { lookupUsername: lookupUsernameV1 },
  contracts: { completeDomainLookup: completeDomainLookupV1, recordDomainLookupFailure: recordDomainLookupFailureV1 },
});
