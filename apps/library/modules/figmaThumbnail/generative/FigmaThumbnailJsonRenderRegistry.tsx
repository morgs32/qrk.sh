import type { ReactNode } from "react";

import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import {
  FigmaCard as FigmaCardLeaf,
  FigmaMediaFooter as FigmaMediaFooterLeaf,
  FigmaThumbnailBand as FigmaThumbnailBandLeaf,
} from "../FigmaThumbnailBrick";
import { figmaThumbnail } from "../figmaThumbnail";

export const { registry } = defineRegistry(figmaThumbnail.catalog, {
  components: {
    ...layoutRegistryComponents,
    FigmaCard: ({ children }: { children?: ReactNode }) => (
      <FigmaCardLeaf>{children}</FigmaCardLeaf>
    ),
    FigmaThumbnailBand: ({ props }: { props: Record<string, unknown> }) => (
      <FigmaThumbnailBandLeaf
        title={typeof props.title === "string" ? props.title : ""}
        thumbnail_url={
          typeof props.thumbnail_url === "string" || props.thumbnail_url === null
            ? props.thumbnail_url
            : null
        }
        thumbnail_width={
          typeof props.thumbnail_width === "number" || props.thumbnail_width === null
            ? props.thumbnail_width
            : null
        }
        thumbnail_height={
          typeof props.thumbnail_height === "number" || props.thumbnail_height === null
            ? props.thumbnail_height
            : null
        }
        imagePosition={typeof props.imagePosition === "string" ? props.imagePosition : "left"}
      />
    ),
    FigmaMediaFooter: ({ props }: { props: Record<string, unknown> }) => (
      <FigmaMediaFooterLeaf
        title={typeof props.title === "string" ? props.title : ""}
        url={typeof props.url === "string" ? props.url : ""}
      />
    ),
  },
});
