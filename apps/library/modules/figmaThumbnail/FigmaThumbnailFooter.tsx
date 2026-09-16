import { Image } from "@unpic/react";

import { MediaFooter } from "../../components/brick/MediaFooter";

export function FigmaThumbnailFooter(props: {
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
      className="flex h-full w-full flex-col no-underline"
      data-figma-card="thumbnail"
      href={props.data.url.length > 0 ? props.data.url : undefined}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] bg-[size:20px_20px]"
            data-figma-fallback="thumbnail"
          >
            <div className="absolute left-[18%] top-[18%] h-[48%] w-[64%] bg-violet-100" />
            <div className="absolute left-[28%] top-[29%] h-[26%] w-[44%] bg-white" />
          </div>
          {props.data.thumbnail_url !== null ? (
            <Image
              key={props.data.thumbnail_url}
              alt={`${props.data.title} Figma thumbnail`}
              className="absolute inset-0 size-full object-cover object-center data-[image-position=left]:object-left data-[image-position=right]:object-right data-[image-position=top]:object-top data-[image-position=bottom]:object-bottom"
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
        </div>
        <MediaFooter
          overline="Figma"
          heading={props.data.title}
          icon={
            <svg aria-label="Figma" className="h-8 w-6 shrink-0" viewBox="0 0 24 36">
              <path d="M6 0h6v12H6a6 6 0 0 1 0-12Z" fill="#F24E1E" />
              <path d="M12 0h6a6 6 0 0 1 0 12h-6V0Z" fill="#FF7262" />
              <path d="M6 12h6v12H6a6 6 0 0 1 0-12Z" fill="#A259FF" />
              <circle cx="18" cy="18" r="6" fill="#1ABCFE" />
              <path d="M6 24h6v6a6 6 0 1 1-6-6Z" fill="#0ACF83" />
            </svg>
          }
        />
      </div>
    </a>
  );
}
