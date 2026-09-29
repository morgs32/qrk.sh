import { Image } from "@unpic/react";
import { makeComponentView } from "../../make/makeComponentView";
import { linkHeroImageComponent } from "./generator/LinkHeroImageComponent";

export const linkHeroImageView = makeComponentView(linkHeroImageComponent, {
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
