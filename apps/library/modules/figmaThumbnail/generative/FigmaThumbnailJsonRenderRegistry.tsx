import { defineRegistry } from "@json-render/react";

import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import {
  FigmaCard as FigmaCardLeaf,
  FigmaMediaFooter as FigmaMediaFooterLeaf,
  FigmaThumbnailBand as FigmaThumbnailBandLeaf,
} from "../FigmaThumbnailBrick";
import { figmaThumbnailJsonRenderCatalog } from "./FigmaThumbnailJsonRenderCatalog";

export const { registry } = defineRegistry(figmaThumbnailJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    FigmaCard: ({ children }) => <FigmaCardLeaf>{children}</FigmaCardLeaf>,
    FigmaThumbnailBand: ({ props }) => (
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
    FigmaMediaFooter: ({ props }) => (
      <FigmaMediaFooterLeaf
        title={typeof props.title === "string" ? props.title : ""}
        url={typeof props.url === "string" ? props.url : ""}
      />
    ),
  },
});
