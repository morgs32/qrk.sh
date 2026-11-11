import { Image } from "@unpic/react";
import { makeComponentView } from "../../react/makeComponentView";
import { linkHeroImageComponentMetadata } from "../definition/generator/LinkHeroImageComponentMetadata";

export const linkHeroImageView = makeComponentView(linkHeroImageComponentMetadata, {
  component(props) {
    const { imageUrl } = props;
    if (imageUrl.length === 0) {
      return null;
    }
    return (
      <div className="relative min-w-0 flex-1 overflow-hidden bg-zinc-200">
        <Image
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          layout="fullWidth"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          sizes="(max-width: 768px) 44vw, 22vw"
          src={imageUrl}
        />
      </div>
    );
  },
});
