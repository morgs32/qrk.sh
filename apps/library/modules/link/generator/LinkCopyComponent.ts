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
    "Link copy column with favicon, full URL, and title. Bind url, title, and iconUrl from state.",
});
