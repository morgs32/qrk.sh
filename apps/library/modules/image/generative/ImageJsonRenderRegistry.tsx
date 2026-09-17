import type { ReactNode } from "react";

import { defineRegistry } from "@json-render/react";

import { MediaFooter } from "../../../components/brick/MediaFooter";
import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { ImageCard as ImageCardLeaf, ImageCover as ImageCoverLeaf } from "../ImageBrick";
import { imageV1 } from "../imageV1";

export const { registry } = defineRegistry(imageV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    ImageCard: ({ children }: { children?: ReactNode }) => (
      <ImageCardLeaf>{children}</ImageCardLeaf>
    ),
    ImageCover: ({ props }: { props: Record<string, unknown> }) => (
      <ImageCoverLeaf
        imageUrl={typeof props.imageUrl === "string" ? props.imageUrl : ""}
        title={typeof props.title === "string" ? props.title : ""}
        imagePosition={typeof props.imagePosition === "string" ? props.imagePosition : "center"}
      />
    ),
    MediaFooter: ({
      children,
      props,
    }: {
      children?: ReactNode;
      props: Record<string, unknown>;
    }) => (
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
