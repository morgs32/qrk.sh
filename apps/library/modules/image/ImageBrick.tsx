import type { ReactNode } from "react";

import { Image as UnpicImage } from "@unpic/react";

import { MediaFooter } from "../../components/brick/MediaFooter";

export function ImageCard(props: { children?: ReactNode }) {
  return (
    <div className="flex h-full w-full min-h-0 min-w-[200px] flex-col overflow-hidden">
      {props.children}
    </div>
  );
}

export function ImageCover(props: { imageUrl: string; title: string; imagePosition: string }) {
  return (
    <div className="relative min-h-0 flex-1 basis-[200px] overflow-hidden">
      <UnpicImage
        src={props.imageUrl}
        alt={props.title}
        className="absolute inset-0 size-full object-cover object-center data-[image-position=top-left]:object-left-top data-[image-position=top-center]:object-top data-[image-position=top-right]:object-right-top data-[image-position=center-left]:object-left data-[image-position=center-right]:object-right data-[image-position=bottom-left]:object-left-bottom data-[image-position=bottom-center]:object-bottom data-[image-position=bottom-right]:object-right-bottom"
        data-image-position={props.imagePosition}
        layout="fullWidth"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
    </div>
  );
}

export function ImageBrick(props: {
  state: { imageUrl: string; title: string };
}) {
  return (
    <ImageCard>
      <ImageCover
        imagePosition="center"
        imageUrl={props.state.imageUrl}
        title={props.state.title}
      />
      <MediaFooter heading={props.state.title} />
    </ImageCard>
  );
}
