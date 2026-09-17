import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../../make/defineComponent";

export const linkCopyComponent = defineComponent({
  type: "LinkCopy",
  props: {
    url: primitives.text(),
    title: primitives.text(),
    siteName: primitives.text(),
    iconUrl: primitives.text(),
  },
  description:
    'Left copy column and sole link. Bind url with { "$state": "/url" } for the href. Bind title/siteName/iconUrl from state.',
});
