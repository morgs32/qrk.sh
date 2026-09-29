import { MediaFooter } from "../../components/brick/MediaFooter";
import { makeComponentView } from "../../make/makeComponentView";
import { figmaMediaFooterComponent } from "./generator/FigmaMediaFooterComponent";

export const figmaMediaFooterView = makeComponentView(figmaMediaFooterComponent, {
  component(props) {
    const { url, title } = props;
    return (
      <MediaFooter
        overline="Figma"
        heading={
          <a
            className="no-underline"
            data-figma-card="thumbnail"
            href={url.length > 0 ? url : undefined}
            rel="noopener noreferrer"
            target="_blank"
          >
            {title}
          </a>
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
    );
  },
});
