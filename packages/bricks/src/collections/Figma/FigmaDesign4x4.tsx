import { Image } from "@unpic/react";

import { BrickFrame } from "../../BrickFrame";

export function FigmaDesign4x4(props: {
  data: {
    title: string;
    url: string;
    thumbnail_url: string | null;
    thumbnail_width: number | null;
    thumbnail_height: number | null;
  };
}) {
  return (
    <BrickFrame backgroundClassName="bg-zinc-100" textClassName="text-zinc-950">
      <a
        className="block h-full w-full p-3 text-inherit no-underline"
        data-figma-card="design"
        href={props.data.url.length > 0 ? props.data.url : undefined}
        rel="noopener noreferrer"
        target="_blank"
      >
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-lg">
          <div
            className="absolute inset-0 bottom-[27%] bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] bg-[size:20px_20px]"
            data-figma-fallback="design"
          >
            <div className="absolute left-[18%] top-[18%] h-[48%] w-[64%] rounded-md border-2 border-dashed border-violet-400 bg-violet-100 shadow-sm" />
            <div className="absolute left-[28%] top-[29%] h-[26%] w-[44%] rounded-sm bg-white shadow" />
          </div>
          {props.data.thumbnail_url !== null ? (
            <Image
              key={props.data.thumbnail_url}
              alt={`${props.data.title} Figma Design thumbnail`}
              className="absolute inset-0 bottom-[27%] h-[73%] w-full object-cover"
              data-figma-thumbnail="design"
              height={props.data.thumbnail_height ?? 450}
              layout="fullWidth"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              sizes="(max-width: 768px) 100vw, 50vw"
              src={props.data.thumbnail_url}
            />
          ) : null}
          <div className="absolute inset-x-0 bottom-0 flex h-[27%] items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4">
            <div className="min-w-0">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Figma Design
              </p>
              <h2 className="m-0 truncate text-lg font-semibold leading-tight">
                {props.data.title}
              </h2>
            </div>
            <svg aria-label="Figma" className="h-8 w-6 shrink-0" viewBox="0 0 24 36">
              <path d="M6 0h6v12H6a6 6 0 0 1 0-12Z" fill="#F24E1E" />
              <path d="M12 0h6a6 6 0 0 1 0 12h-6V0Z" fill="#FF7262" />
              <path d="M6 12h6v12H6a6 6 0 0 1 0-12Z" fill="#A259FF" />
              <circle cx="18" cy="18" r="6" fill="#1ABCFE" />
              <path d="M6 24h6v6a6 6 0 1 1-6-6Z" fill="#0ACF83" />
            </svg>
          </div>
        </div>
      </a>
    </BrickFrame>
  );
}
