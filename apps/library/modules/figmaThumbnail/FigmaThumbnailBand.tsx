import { Image } from "@unpic/react";
import { makeComponentView } from "../../make/makeComponentView";
import { figmaThumbnailBandComponent } from "./generator/FigmaThumbnailBandComponent";

export const figmaThumbnailBandView = makeComponentView(figmaThumbnailBandComponent, {
  component(props) {
    const { thumbnail_url, title, imagePosition, thumbnail_height } = props;
    return (
      <div className="relative min-h-[200px] min-w-[200px] flex-1 overflow-hidden">
        <div
          className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] bg-[size:20px_20px]"
          data-figma-fallback="thumbnail"
        >
          <div className="absolute left-[18%] top-[18%] h-[48%] w-[64%] bg-violet-100" />
          <div className="absolute left-[28%] top-[29%] h-[26%] w-[44%] bg-white" />
        </div>
        {thumbnail_url !== null ? (
          <Image
            key={thumbnail_url}
            alt={`${title} Figma thumbnail`}
            className="absolute inset-0 size-full object-cover object-center data-[image-position=left]:object-left data-[image-position=right]:object-right data-[image-position=top]:object-top data-[image-position=bottom]:object-bottom"
            data-image-position={imagePosition}
            data-figma-thumbnail="thumbnail"
            height={thumbnail_height ?? 450}
            layout="fullWidth"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            sizes="(max-width: 768px) 100vw, 50vw"
            src={thumbnail_url}
          />
        ) : null}
      </div>
    );
  },
});
