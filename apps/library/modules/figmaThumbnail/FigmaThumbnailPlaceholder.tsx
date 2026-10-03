import { MediaFooter } from "../../components/brick/MediaFooter";
import { Skeleton } from "../../components/ui/skeleton";
import { figmaCardView } from "./FigmaCard";

export function FigmaThumbnailPlaceholder() {
  return (
    <figmaCardView.Component>
      <div data-figma-thumbnail-placeholder className="flex h-full min-h-0 flex-col">
        <Skeleton
          aria-hidden="true"
          className="min-h-[200px] min-w-[200px] flex-1 rounded-none motion-reduce:animate-none"
        />
        <MediaFooter
          overline="Figma"
          heading={
            <Skeleton aria-hidden="true" className="h-6 w-3/4 motion-reduce:animate-none" />
          }
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
    </figmaCardView.Component>
  );
}
