import { Image } from "@unpic/react";
import { makeComponentView } from "../../make/makeComponentView";
import { instagramPostGridComponent } from "./generator/InstagramPostGridComponent";

export const instagramPostGridView = makeComponentView(instagramPostGridComponent, {
  component(props) {
    const { username, postImageUrls } = props;
    if (postImageUrls.length === 0) {
      return null;
    }
    return (
      <div className="relative min-h-[200px] min-w-[200px] flex-1 overflow-hidden bg-zinc-200">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
          {postImageUrls.map((postImageUrl, index) => (
            <Image
              key={`${index}:${postImageUrl}`}
              alt={`Latest post from @${username}`}
              className="size-full min-h-[200px] min-w-[200px] object-cover"
              layout="fullWidth"
              src={postImageUrl}
            />
          ))}
        </div>
      </div>
    );
  },
});
