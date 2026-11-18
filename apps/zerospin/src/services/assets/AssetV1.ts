import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { makeModelVersion, modelId, primitives } from "@zerospin/sdk/browser";
import { asset } from "./asset";

export const assetV1 = makeModelVersion(asset, {
  version: 1,
  attributes: {
    ownerAggregateId: primitives.text(),
    uploadSiteId: modelId({ model: site }),
    objectKey: primitives.text({ unique: true }),
    contentType: primitives.text(),
    size: primitives.integer(),
    sha256: primitives.text(),
    ready: primitives.boolean(),
  },
  indexes: [],
});
