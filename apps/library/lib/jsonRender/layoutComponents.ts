import { primitives } from "@zerospin/schema";

import { defineComponent } from "../../make/defineComponent";

const justifyContent = primitives.enum({
  values: ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"],
  nullable: true,
});

const alignItems = primitives.enum({
  values: ["flex-start", "flex-end", "center", "stretch", "baseline"],
  nullable: true,
});

const flexWrap = primitives.enum({
  values: ["nowrap", "wrap", "wrap-reverse"],
  nullable: true,
});

export const brickShellComponent = defineComponent({
  type: "BrickShell",
  props: {},
  slots: ["default"],
  description:
    "Column shell for the card. Children paint top-to-bottom; typically BrickBody then BrickFooter.",
});

export const brickBodyComponent = defineComponent({
  type: "BrickBody",
  props: {},
  slots: ["default"],
  description:
    "Scrollable flex-1 band. Last child here still sits above BrickFooter. Put content here only when it should scroll with the body, not pin to the card bottom.",
});

export const brickFooterComponent = defineComponent({
  type: "BrickFooter",
  props: {},
  slots: ["default"],
  description:
    "Pinned bottom band (mt-auto). Put content here when the user asks for the bottom of the card. Accepts any children (identity, stats, or other leaves); not reserved for counts.",
});

export const columnComponent = defineComponent({
  type: "Column",
  props: {
    gap: primitives.integer(),
    justifyContent,
    alignItems,
    flexWrap,
  },
  slots: ["default"],
  description:
    "Vertical flex stack. gap must be 2 or 4. Put inside BrickBody with gap 2 for lines stacked top-to-bottom.",
});

export const rowComponent = defineComponent({
  type: "Row",
  props: {
    gap: primitives.integer(),
    justifyContent,
    alignItems,
    flexWrap,
    className: primitives.text({ nullable: true }),
  },
  slots: ["default"],
  description:
    'Horizontal flex cluster. gap must be 2 or 4. Put inside BrickFooter with gap 2, justifyContent "flex-end", and className "w-full" to pin counts to the right.',
});
