import { Image } from "@unpic/react";

export function FigmaThumbnailHeader(props: {
  breakpoint: "sm" | "md" | "lg" | "xl";
  options?: { imagePosition: string };
  data: {
    title: string;
    url: string;
    thumbnail_url: string | null;
    thumbnail_width: number | null;
    thumbnail_height: number | null;
  };
}) {
  return (
    <a
      className="block h-full w-full no-underline"
      data-figma-card="thumbnail"
      href={props.data.url.length > 0 ? props.data.url : undefined}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="not-typeset absolute inset-x-0 top-0 bottom-[20.25%] bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] bg-[size:20px_20px]"
          data-figma-fallback="thumbnail"
        >
          <div className="absolute left-[18%] top-[18%] h-[48%] w-[64%] bg-violet-100" />
          <div className="absolute left-[28%] top-[29%] h-[26%] w-[44%] bg-white" />
        </div>
        {props.data.thumbnail_url !== null ? (
          <Image
            key={props.data.thumbnail_url}
            alt={`${props.data.title} Figma thumbnail`}
            className="absolute inset-x-0 top-0 bottom-[20.25%] h-[79.75%] w-full object-cover object-center data-[image-position=left]:object-left data-[image-position=right]:object-right data-[image-position=top]:object-top data-[image-position=bottom]:object-bottom"
            data-image-position={props.options?.imagePosition ?? "left"}
            data-figma-thumbnail="thumbnail"
            height={props.data.thumbnail_height ?? 450}
            layout="fullWidth"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            sizes="(max-width: 768px) 100vw, 50vw"
            src={props.data.thumbnail_url}
          />
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex h-[20.25%] items-center gap-2 px-3">
          <svg aria-label="Figma" className="h-[18px] w-3 shrink-0" viewBox="0 0 24 36">
            <path d="M6 0h6v12H6a6 6 0 0 1 0-12Z" fill="#F24E1E" />
            <path d="M12 0h6a6 6 0 0 1 0 12h-6V0Z" fill="#FF7262" />
            <path d="M6 12h6v12H6a6 6 0 0 1 0-12Z" fill="#A259FF" />
            <circle cx="18" cy="18" r="6" fill="#1ABCFE" />
            <path d="M6 24h6v6a6 6 0 1 1-6-6Z" fill="#0ACF83" />
          </svg>
          <div className="min-w-0">
            <h2 className="m-0 truncate">
              {props.data.title}
            </h2>
          </div>
        </div>
      </div>
    </a>
  );
}
