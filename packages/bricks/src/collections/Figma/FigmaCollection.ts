import { primitives } from "@zerospin/core/models/primitives";

import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { makeBrick } from "../../makeBrick";
import { FigmaBoard4x4 } from "./FigmaBoard4x4";
import { FigmaDesign4x4 } from "./FigmaDesign4x4";
import { FigmaPrototype4x4 } from "./FigmaPrototype4x4";
import { FigmaSlides4x4 } from "./FigmaSlides4x4";

export const figmaCollection = makeCollection({
  collectionName: "figma",
  collectionLabel: "Figma",
  collectionDescription: "Live previews for Figma files, boards, slides, and prototypes.",
  variants: {
    design: makeVariant({
      variant: "design",
      variantDescription: "A canvas-focused preview of a Figma Design file.",
      payloadShape: {
        url: primitives.text({
          defaultValue: "https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/Example-design",
        }),
      },
      dataShape: {
        title: primitives.text(),
        url: primitives.text(),
        thumbnail_url: primitives.text({ nullable: true }),
        thumbnail_width: primitives.integer({ nullable: true }),
        thumbnail_height: primitives.integer({ nullable: true }),
      },
      defaultData: {
        title: "Figma Design",
        url: "",
        thumbnail_url: null,
        thumbnail_width: null,
        thumbnail_height: null,
      },
      getData: ({ api, payload }) => api.figmaRepo().getDesign(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "design",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: FigmaDesign4x4,
        }),
      },
    }),
    board: makeVariant({
      variant: "board",
      variantDescription: "A sticky-note canvas preview of a FigJam board.",
      payloadShape: {
        url: primitives.text({
          defaultValue: "https://www.figma.com/board/BcDeFgHiJkLmNoPqRsTuVw/Example-board",
        }),
      },
      dataShape: {
        title: primitives.text(),
        url: primitives.text(),
        thumbnail_url: primitives.text({ nullable: true }),
        thumbnail_width: primitives.integer({ nullable: true }),
        thumbnail_height: primitives.integer({ nullable: true }),
      },
      defaultData: {
        title: "FigJam Board",
        url: "",
        thumbnail_url: null,
        thumbnail_width: null,
        thumbnail_height: null,
      },
      getData: ({ api, payload }) => api.figmaRepo().getBoard(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "board",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: FigmaBoard4x4,
        }),
      },
    }),
    slides: makeVariant({
      variant: "slides",
      variantDescription: "A presentation-stage preview of a Figma Slides deck.",
      payloadShape: {
        url: primitives.text({
          defaultValue: "https://www.figma.com/slides/CdEfGhIjKlMnOpQrStUvWx/Example-slides",
        }),
      },
      dataShape: {
        title: primitives.text(),
        url: primitives.text(),
        thumbnail_url: primitives.text({ nullable: true }),
        thumbnail_width: primitives.integer({ nullable: true }),
        thumbnail_height: primitives.integer({ nullable: true }),
      },
      defaultData: {
        title: "Figma Slides",
        url: "",
        thumbnail_url: null,
        thumbnail_width: null,
        thumbnail_height: null,
      },
      getData: ({ api, payload }) => api.figmaRepo().getSlides(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "slides",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: FigmaSlides4x4,
        }),
      },
    }),
    prototype: makeVariant({
      variant: "prototype",
      variantDescription: "A device-framed preview of a Figma prototype.",
      payloadShape: {
        url: primitives.text({
          defaultValue: "https://www.figma.com/proto/DeFgHiJkLmNoPqRsTuVwXy/Example-prototype",
        }),
      },
      dataShape: {
        title: primitives.text(),
        url: primitives.text(),
        thumbnail_url: primitives.text({ nullable: true }),
        thumbnail_width: primitives.integer({ nullable: true }),
        thumbnail_height: primitives.integer({ nullable: true }),
      },
      defaultData: {
        title: "Figma Prototype",
        url: "",
        thumbnail_url: null,
        thumbnail_width: null,
        thumbnail_height: null,
      },
      getData: ({ api, payload }) => api.figmaRepo().getPrototype(payload.url),
      sizes: {
        "4x4": makeBrick({
          variant: "prototype",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: FigmaPrototype4x4,
        }),
      },
    }),
  },
});
