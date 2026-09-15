import { Image } from "@unpic/react";
import { Camera } from "lucide-react";

import { BrickFrame } from "../../BrickFrame";
import { Button } from "../../ui/button";

export function InstagramDefault4x4(props: {
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
    <BrickFrame backgroundClassName="bg-[#f4effb]" textClassName="text-zinc-950">
      <div className="flex h-full w-full min-h-0 flex-col gap-3 rounded-[1.35rem] p-6">
        <div className="flex min-h-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center gap-3">
            <div className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] p-[2px] shadow-sm">
              <Image
                alt={`@${props.data.username}`}
                className="size-full rounded-[10px] object-cover"
                height={36}
                layout="constrained"
                src={props.data.profileImageUrl}
                width={36}
              />
              <Camera className="absolute inset-0 m-auto size-5 text-white drop-shadow" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">@{props.data.username}</p>
              <p className="text-xs text-zinc-500">instagram.com</p>
            </div>
          </div>

          <Button
            asChild
            className="h-7 w-fit rounded-md bg-[#4295ed] px-3 text-xs text-white hover:bg-[#3186df]"
            size="sm"
          >
            <a
              href={`https://www.instagram.com/${props.data.username}/`}
              rel="noreferrer"
              target="_blank"
            >
              Follow {props.data.followersText}
            </a>
          </Button>

          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5 overflow-hidden rounded-lg">
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
      </div>
    </BrickFrame>
  );
}
