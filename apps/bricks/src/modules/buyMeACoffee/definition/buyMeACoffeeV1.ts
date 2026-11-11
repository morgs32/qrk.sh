import { primitives } from "@zerospin/shapes";
import { Schema } from "effect";

import { defineComponentMetadata } from "../../../definition/defineComponentMetadata";
import { defineModule } from "../../../definition/defineModule";
import { brickShellComponentMetadata } from "../../../definition/layoutComponentMetadata";
import { makeModuleVersion } from "../../../definition/makeModuleVersion";
import { buyMeACoffeeMessageSchema, buyMeACoffeeUrlSchema } from "./buyMeACoffeeSchemas";

export const buyMeACoffeeCardComponentMetadata = defineComponentMetadata({
  type: "BuyMeACoffeeCard",
  propsShape: {
    url: primitives.json({ schema: buyMeACoffeeUrlSchema }),
    message: primitives.json({ schema: buyMeACoffeeMessageSchema }),
  },
  description:
    "Coffee illustration, optional support message, and a link to the creator's Buy Me a Coffee page.",
});

export const buyMeACoffeeV1 = makeModuleVersion(
  defineModule({
    id: "buy-me-a-coffee",
    abbreviation: "bmc",
    label: "Buy Me a Coffee",
    description: "A link to a creator's Buy Me a Coffee page.",
  }),
  {
    version: 1,
    variants: { default: { defaultWidth: 320, minWidth: 160, defaultHeight: 180 } },
    hasPlaceholder: true,
    componentMetadata: {
      BrickShell: brickShellComponentMetadata,
      BuyMeACoffeeCard: buyMeACoffeeCardComponentMetadata,
    },
    defaultSpec: {
      root: "shell",
      elements: {
        shell: { type: "BrickShell", props: {}, children: ["support"] },
        support: {
          type: "BuyMeACoffeeCard",
          props: {
            url: { $state: "/payload/url" },
            message: { $state: "/payload/message" },
          },
        },
      },
    },
    stateShape: {
      payload: primitives.json({
        schema: Schema.Struct({ url: buyMeACoffeeUrlSchema, message: buyMeACoffeeMessageSchema }),
      }),
    },
  },
);
