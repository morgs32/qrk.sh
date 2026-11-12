import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { Schema } from "effect";

import { siteV1 } from "./SiteV1";

const focalCoordinate = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }));

export const siteV2 = upgradeModelVersion(siteV1, {
  version: 2,
  attributes: {
    socialPreview: primitives.json({
      schema: Schema.Struct({
        imageUrl: Schema.String.check(Schema.isNonEmpty()),
        crop: Schema.NullOr(
          Schema.Struct({
            x: focalCoordinate,
            y: focalCoordinate,
            zoom: Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
          }),
        ),
      }),
      nullable: true,
      defaultValue: null,
    }),
  },
});
