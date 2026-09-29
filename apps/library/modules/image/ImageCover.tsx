import { Image as UnpicImage } from "@unpic/react";
import { makeComponentView } from "../../make/makeComponentView";
import { imageCoverComponent } from "./generator/ImageCoverComponent";

export const imageCoverView = makeComponentView(imageCoverComponent, {
  component(props) {
    const { imageUrl, title, imagePosition } = props;
    return (
      <div className="relative min-h-[200px] min-w-[200px] flex-1 overflow-hidden">
        <UnpicImage
          src={imageUrl}
          alt={title}
          className="absolute inset-0 size-full object-cover object-center data-[image-position=top-left]:object-left-top data-[image-position=top-center]:object-top data-[image-position=top-right]:object-right-top data-[image-position=center-left]:object-left data-[image-position=center-right]:object-right data-[image-position=bottom-left]:object-left-bottom data-[image-position=bottom-center]:object-bottom data-[image-position=bottom-right]:object-right-bottom"
          data-image-position={imagePosition}
          layout="fullWidth"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      </div>
    );
  },
});
