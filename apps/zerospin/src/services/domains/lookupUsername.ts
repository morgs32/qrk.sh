import { user } from "@qrk.sh/bricks/zerospin/models/user/user";
import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { defineServiceExternalContract, modelId, primitives } from "@zerospin/sdk/browser";
import * as Schema from "effect/Schema";

export const lookupUsername = defineServiceExternalContract({
  name: "lookupUsername",
  version: 1,
  payload: {
    siteId: modelId({ model: site }),
    userId: modelId({ model: user }),
    aggregateId: primitives.text(),
  },
  response: Schema.Struct({ username: Schema.NullOr(Schema.String) }),
});
