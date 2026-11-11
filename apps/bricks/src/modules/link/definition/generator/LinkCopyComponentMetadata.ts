import { primitives } from "@zerospin/shapes";

import { defineComponentMetadata } from "../../../../definition/defineComponentMetadata";

export const linkCopyComponentMetadata = defineComponentMetadata({
  type: "LinkCopy",
  propsShape: {
    url: primitives.text(),
    title: primitives.text(),
    siteName: primitives.text(),
    iconUrl: primitives.text(),
  },
  description:
    "Link copy column with favicon, full URL, and title. Bind url, title, and iconUrl from state.",
});
