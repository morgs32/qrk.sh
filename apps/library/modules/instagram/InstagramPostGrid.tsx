import { Image } from "@unpic/react";
import { makeComponentView } from "../../make/makeComponentView";
import { instagramPostGridComponent } from "./generator/InstagramPostGridComponent";

export const instagramPostGridView = makeComponentView(instagramPostGridComponent, {
  component(props) {
    const { username, postImageUrl1, postImageUrl2, postImageUrl3, postImageUrl4 } = props;
    return (
      <div className="relative min-h-[200px] min-w-[200px] flex-1 overflow-hidden bg-zinc-200">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
          <Image
            alt={`Latest post from @${username}`}
            className="size-full min-h-[200px] min-w-[200px] object-cover"
            layout="fullWidth"
            src={postImageUrl1}
          />
          <Image
            alt={`Latest post from @${username}`}
            className="size-full min-h-[200px] min-w-[200px] object-cover"
            layout="fullWidth"
            src={postImageUrl2}
          />
          <Image
            alt={`Latest post from @${username}`}
            className="size-full min-h-[200px] min-w-[200px] object-cover"
            layout="fullWidth"
            src={postImageUrl3}
          />
          <Image
            alt={`Latest post from @${username}`}
            className="size-full min-h-[200px] min-w-[200px] object-cover"
            layout="fullWidth"
            src={postImageUrl4}
          />
        </div>
      </div>
    );
  },
});
