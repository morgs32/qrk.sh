import { defineRegistry } from "@json-render/react";

import { MediaFooter } from "../../../components/brick/MediaFooter";
import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { ImageCard as ImageCardLeaf, ImageCover as ImageCoverLeaf } from "../ImageBrick";
import { imageJsonRenderCatalog } from "./ImageJsonRenderCatalog";

export const { registry } = defineRegistry(imageJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    ImageCard: ({ children }) => <ImageCardLeaf>{children}</ImageCardLeaf>,
    ImageCover: ({ props }) => (
      <ImageCoverLeaf
        imageUrl={typeof props.imageUrl === "string" ? props.imageUrl : ""}
        title={typeof props.title === "string" ? props.title : ""}
        imagePosition={typeof props.imagePosition === "string" ? props.imagePosition : "center"}
      />
    ),
    MediaFooter: ({ children, props }) => (
      <MediaFooter
        overline={typeof props.overline === "string" ? props.overline : undefined}
        heading={typeof props.heading === "string" ? props.heading : undefined}
        iconUrl={
          typeof props.iconUrl === "string" && props.iconUrl.length > 0 ? props.iconUrl : undefined
        }
      >
        {children}
      </MediaFooter>
    ),
  },
});
