import { Image } from "@unpic/react";
import { Play } from "lucide-react";

import { BrickFrame } from "../../BrickFrame";

export function FigmaPrototype4x4(props: {
  data: {
    title: string;
    url: string;
    thumbnail_url: string | null;
    thumbnail_width: number | null;
    thumbnail_height: number | null;
  };
}) {
  return (
    <BrickFrame backgroundClassName="bg-[#e9e4dc]" textClassName="text-zinc-950">
      <a
        className="flex h-full w-full flex-col items-center p-3 text-inherit no-underline"
        data-figma-card="prototype"
        href={props.data.url.length > 0 ? props.data.url : undefined}
        rel="noopener noreferrer"
        target="_blank"
      >
        <div className="relative min-h-0 w-[68%] flex-1 overflow-hidden rounded-[24px] border-[6px] border-zinc-900 bg-white shadow-2xl">
          <div className="absolute left-1/2 top-1 z-20 h-2 w-12 -translate-x-1/2 rounded-full bg-zinc-900" />
          <div
            className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(160deg,#ddd6fe_0%,#bfdbfe_50%,#fbcfe8_100%)]"
            data-figma-fallback="prototype"
          >
            <div className="w-[72%] rounded-xl bg-white/90 p-4 shadow-lg">
              <div className="mb-3 h-3 w-1/2 rounded-full bg-violet-300" />
              <div className="mb-2 h-2 w-full rounded-full bg-zinc-200" />
              <div className="h-2 w-3/4 rounded-full bg-zinc-200" />
              <div className="mt-5 h-8 rounded-lg bg-violet-600" />
            </div>
          </div>
          {props.data.thumbnail_url !== null ? (
            <Image
              key={props.data.thumbnail_url}
              alt={`${props.data.title} Figma prototype thumbnail`}
              className="absolute inset-0 h-full w-full object-cover"
              data-figma-thumbnail="prototype"
              height={props.data.thumbnail_height ?? 450}
              layout="fullWidth"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              sizes="(max-width: 768px) 100vw, 50vw"
              src={props.data.thumbnail_url}
            />
          ) : null}
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-violet-700 shadow-xl">
              <Play aria-label="Open prototype" className="ml-1 h-7 w-7 fill-current" />
            </span>
          </div>
        </div>
        <div className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-md">
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-600">
              Figma Prototype
            </p>
            <h2 className="m-0 truncate text-base font-bold leading-tight">{props.data.title}</h2>
          </div>
          <svg aria-label="Figma" className="h-7 w-5 shrink-0" viewBox="0 0 24 36">
            <path d="M6 0h6v12H6a6 6 0 0 1 0-12Z" fill="#F24E1E" />
            <path d="M12 0h6a6 6 0 0 1 0 12h-6V0Z" fill="#FF7262" />
            <path d="M6 12h6v12H6a6 6 0 0 1 0-12Z" fill="#A259FF" />
            <circle cx="18" cy="18" r="6" fill="#1ABCFE" />
            <path d="M6 24h6v6a6 6 0 1 1-6-6Z" fill="#0ACF83" />
          </svg>
        </div>
      </a>
    </BrickFrame>
  );
}
