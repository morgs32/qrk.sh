import { Image } from "@unpic/react";

export function InstagramDefaultFeed(props: {
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
      className="block h-full w-full text-inherit no-underline"
      href={`https://www.instagram.com/${props.data.username}/`}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-x-0 top-0 bottom-[20.25%] grid grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-zinc-200">
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

        <div className="absolute inset-x-0 bottom-0 flex h-[20.25%] items-center gap-2 px-3">
          <div className="relative size-[18px] shrink-0 overflow-hidden bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] p-px">
            <Image
              alt={`@${props.data.username}`}
              className="size-full object-cover"
              height={16}
              layout="constrained"
              src={props.data.profileImageUrl}
              width={16}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-xs font-semibold leading-tight">
              @{props.data.username}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] font-medium text-zinc-500">
              {props.data.followersText}
            </span>
            <span className="bg-[#4295ed] px-2 py-0.5 text-[10px] font-medium text-white">
              Follow me
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
