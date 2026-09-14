import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";

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
      variantLabel: "Design",
      variantDescription: "A canvas-focused preview of a Figma Design file.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text({
            defaultValue: "https://www.figma.com/design/AbCdEfGhIjKlMnOpQrStUv/Example-design",
          }),
        },
        fetcher: async ({ api, payload, setData }) => {
          const result = await api.figmaRepo().getDesign(payload.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
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
      variantLabel: "Board",
      variantDescription: "A sticky-note canvas preview of a FigJam board.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text({
            defaultValue: "https://www.figma.com/board/BcDeFgHiJkLmNoPqRsTuVw/Example-board",
          }),
        },
        fetcher: async ({ api, payload, setData }) => {
          const result = await api.figmaRepo().getBoard(payload.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
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
      variantLabel: "Slides",
      variantDescription: "A presentation-stage preview of a Figma Slides deck.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text({
            defaultValue: "https://www.figma.com/slides/CdEfGhIjKlMnOpQrStUvWx/Example-slides",
          }),
        },
        fetcher: async ({ api, payload, setData }) => {
          const result = await api.figmaRepo().getSlides(payload.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
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
      variantLabel: "Prototype",
      variantDescription: "A device-framed preview of a Figma prototype.",
      configuration: makeFetcherConfiguration({
        payloadShape: {
          url: primitives.text({
            defaultValue: "https://www.figma.com/proto/DeFgHiJkLmNoPqRsTuVwXy/Example-prototype",
          }),
        },
        fetcher: async ({ api, payload, setData }) => {
          const result = await api.figmaRepo().getPrototype(payload.url);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
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
