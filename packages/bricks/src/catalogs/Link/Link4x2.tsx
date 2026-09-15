import { Image } from "@unpic/react";

import { BrickFrame } from "../../BrickFrame";

export function Link4x2(props: {
  data: {
    url: string;
    title: string;
    description: string;
    siteName: string;
    imageUrl: string;
    iconUrl: string;
  };
}) {
  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <a
        className="block h-full w-full p-3 text-inherit no-underline"
        data-link-card="default"
        href={props.data.url.length > 0 ? props.data.url : undefined}
        rel="noopener noreferrer"
        target="_blank"
      >
        <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {props.data.iconUrl.length > 0 ? (
              <Image
                alt=""
                className="mb-3 h-10 w-10 shrink-0 rounded-lg object-cover shadow-sm"
                height={40}
                layout="constrained"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                src={props.data.iconUrl}
                width={40}
              />
            ) : null}
            <h2 className="m-0 line-clamp-3 text-base font-medium leading-snug">
              {props.data.title}
            </h2>
            <p className="m-0 mt-1 truncate text-sm text-zinc-500">{props.data.siteName}</p>
          </div>

          {props.data.imageUrl.length > 0 ? (
            <div className="relative h-full w-[44%] shrink-0 overflow-hidden rounded-xl bg-zinc-200">
              <Image
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                layout="fullWidth"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                sizes="(max-width: 768px) 44vw, 22vw"
                src={props.data.imageUrl}
              />
            </div>
          ) : null}
        </div>
      </a>
    </BrickFrame>
  );
}
