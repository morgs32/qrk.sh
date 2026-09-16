import { Image as UnpicImage } from "@unpic/react";

import { MediaFooter } from "../../../components/brick/MediaFooter";

export function Image(props: {
  breakpoint: "sm" | "md" | "lg" | "xl";
  data: {
    imageUrl: string;
    title: string;
  };
}) {
  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <UnpicImage
          src={props.data.imageUrl}
          alt={props.data.title}
          className="absolute inset-0 size-full object-cover"
          layout="fullWidth"
          height={800}
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>
      <MediaFooter heading={props.data.title} />
    </div>
  );
}
