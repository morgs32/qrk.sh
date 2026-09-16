import { Image } from "@unpic/react";

import { MediaFooter } from "../../../components/brick/MediaFooter";

export function Instagram(props: {
  data: {
    username: string;
    profileImageUrl: string;
    followersText: string;
    postImageUrl1: string;
    postImageUrl2: string;
    postImageUrl3: string;
    postImageUrl4: string;
  };
}) {
  return (
    <a
      className="flex h-full w-full flex-col no-underline"
      href={`https://www.instagram.com/${props.data.username}/`}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-200">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
            <Image
              alt={`Latest post from @${props.data.username}`}
              className="size-full min-h-0 object-cover"
              layout="fullWidth"
              src={props.data.postImageUrl1}
            />
            <Image
              alt={`Latest post from @${props.data.username}`}
              className="size-full min-h-0 object-cover"
              layout="fullWidth"
              src={props.data.postImageUrl2}
            />
            <Image
              alt={`Latest post from @${props.data.username}`}
              className="size-full min-h-0 object-cover"
              layout="fullWidth"
              src={props.data.postImageUrl3}
            />
            <Image
              alt={`Latest post from @${props.data.username}`}
              className="size-full min-h-0 object-cover"
              layout="fullWidth"
              src={props.data.postImageUrl4}
            />
          </div>
        </div>
        <MediaFooter
          heading={`@${props.data.username}`}
          icon={
            <div
              aria-hidden
              className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24">
                <rect
                  height="20"
                  rx="5"
                  stroke="#fff"
                  strokeWidth="2"
                  width="20"
                  x="2"
                  y="2"
                />
                <circle cx="12" cy="12" r="5" stroke="#fff" strokeWidth="2" />
                <circle cx="17.5" cy="6.5" fill="#fff" r="1.5" />
              </svg>
            </div>
          }
        >
          <span>{props.data.followersText}</span>
          <span className="bg-[#4295ed] px-2 py-0.5">Follow me</span>
        </MediaFooter>
      </div>
    </a>
  );
}
