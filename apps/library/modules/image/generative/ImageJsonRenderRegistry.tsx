import type { ReactNode } from "react";

import { Image as UnpicImage } from "@unpic/react";
import { defineRegistry } from "@json-render/react";

import { MediaFooter } from "../../../components/brick/MediaFooter";
import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { imageJsonRenderCatalog } from "./ImageJsonRenderCatalog";

function ImageCard(props: { children?: ReactNode }) {
  return (
    <div className="flex h-full w-full min-h-0 min-w-[200px] flex-col overflow-hidden">
      {props.children}
    </div>
  );
}

function ImageCover(props: { imageUrl: string; title: string }) {
  return (
    <div className="relative min-h-0 flex-1 basis-[200px] overflow-hidden">
      <UnpicImage
        src={props.imageUrl}
        alt={props.title}
        className="absolute inset-0 size-full object-cover"
        layout="fullWidth"
        height={800}
        sizes="(max-width: 768px) 100vw, 50vw"
      />
    </div>
  );
}

export const { registry } = defineRegistry(imageJsonRenderCatalog, {
  components: {
    ...layoutRegistryComponents,
    ImageCard: ({ children }) => <ImageCard>{children}</ImageCard>,
    ImageCover: ({ props }) => (
      <ImageCover
        imageUrl={typeof props.imageUrl === "string" ? props.imageUrl : ""}
        title={typeof props.title === "string" ? props.title : ""}
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
