import { modelId, makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { domain } from "./domain";

export const domainV1 = makeModelVersion(domain, {
  version: 1,
  attributes: {
    hostname: primitives.text({ unique: true }),
    siteId: modelId({ model: site, unique: true }),
    userId: modelId({ model: user }),
    aggregateId: primitives.text(),
  },
  indexes: [],
});
