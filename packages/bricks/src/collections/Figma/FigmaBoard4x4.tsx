import { Image } from "@unpic/react";

import { BrickFrame } from "../../BrickFrame";

export function FigmaBoard4x4(props: {
  data: {
    title: string;
    url: string;
    thumbnail_url: string | null;
    thumbnail_width: number | null;
    thumbnail_height: number | null;
  };
}) {
  return (
    <BrickFrame backgroundClassName="bg-[#f5f0ff]" textClassName="text-violet-950">
      <a
        className="relative block h-full w-full overflow-hidden p-4 text-inherit no-underline"
        data-figma-card="board"
        href={props.data.url.length > 0 ? props.data.url : undefined}
        rel="noopener noreferrer"
        target="_blank"
      >
        <div className="absolute left-3 top-4 h-16 w-16 -rotate-6 rounded-sm bg-[#fff36d] shadow-md" />
        <div className="absolute right-3 top-8 h-14 w-14 rotate-6 rounded-sm bg-[#ffbdf2] shadow-md" />
        <div className="absolute bottom-6 left-5 h-14 w-14 rotate-3 rounded-sm bg-[#a7f3d0] shadow-md" />
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border-4 border-white bg-white shadow-xl">
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#fbfaff]">
            <div
              className="absolute inset-0 bg-[radial-gradient(circle,#c4b5fd_1.5px,transparent_1.5px)] bg-[size:18px_18px]"
              data-figma-fallback="board"
            >
              <div className="absolute left-[16%] top-[18%] h-20 w-24 -rotate-3 bg-[#fff36d] p-3 text-xs font-bold shadow">
                Ideas
              </div>
              <div className="absolute right-[14%] top-[34%] h-16 w-20 rotate-2 bg-[#ffbdf2] p-3 text-xs font-bold shadow">
                Next
              </div>
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 220">
                <path
                  d="M110 70 C155 56 166 112 210 102"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeDasharray="7 5"
                  strokeWidth="3"
                />
              </svg>
            </div>
            {props.data.thumbnail_url !== null ? (
              <Image
                key={props.data.thumbnail_url}
                alt={`${props.data.title} FigJam board thumbnail`}
                className="absolute inset-0 h-full w-full object-cover"
                data-figma-thumbnail="board"
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
          <div className="flex shrink-0 items-center justify-between gap-3 bg-violet-600 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200">
                FigJam board
              </p>
              <h2 className="m-0 truncate text-lg font-bold leading-tight">{props.data.title}</h2>
            </div>
            <svg aria-label="Figma" className="h-7 w-5 shrink-0" viewBox="0 0 24 36">
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
