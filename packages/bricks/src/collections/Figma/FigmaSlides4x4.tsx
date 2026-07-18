import { Image } from "@unpic/react";

import { BrickFrame } from "../../BrickFrame";

export function FigmaSlides4x4(props: {
  data: {
    title: string;
    url: string;
    thumbnail_url: string | null;
    thumbnail_width: number | null;
    thumbnail_height: number | null;
  };
}) {
  return (
    <BrickFrame backgroundClassName="bg-zinc-950" textClassName="text-white">
      <a
        className="flex h-full w-full flex-col p-4 text-inherit no-underline"
        data-figma-card="slides"
        href={props.data.url.length > 0 ? props.data.url : undefined}
        rel="noopener noreferrer"
        target="_blank"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="rounded-full bg-orange-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
            Figma Slides
          </span>
          <span className="text-xs text-zinc-400">01 / 01</span>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center rounded-xl bg-black p-3 shadow-[0_16px_35px_rgba(0,0,0,0.45)]">
          <div className="relative aspect-video w-full overflow-hidden rounded-md bg-[#fff7ed]">
            <div
              className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,#fff7ed_0%,#fed7aa_100%)]"
              data-figma-fallback="slides"
            >
              <div className="h-[52%] w-[72%] border-l-8 border-orange-500 pl-5">
                <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
                  Presentation
                </p>
                <p className="mt-2 text-2xl font-black leading-none text-zinc-900">Big idea.</p>
              </div>
            </div>
            {props.data.thumbnail_url !== null ? (
              <Image
                key={props.data.thumbnail_url}
                alt={`${props.data.title} Figma Slides thumbnail`}
                className="absolute inset-0 h-full w-full object-cover"
                data-figma-thumbnail="slides"
                height={props.data.thumbnail_height ?? 450}
                layout="fullWidth"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                sizes="(max-width: 768px) 100vw, 50vw"
                src={props.data.thumbnail_url}
              />
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <h2 className="m-0 min-w-0 truncate text-lg font-semibold leading-tight">
            {props.data.title}
          </h2>
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
