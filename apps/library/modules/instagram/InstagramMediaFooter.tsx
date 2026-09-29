import { MediaFooter } from "../../components/brick/MediaFooter";
import { makeComponentView } from "../../make/makeComponentView";
import { instagramMediaFooterComponent } from "./generator/InstagramMediaFooterComponent";

export const instagramMediaFooterView = makeComponentView(instagramMediaFooterComponent, {
  component(props) {
    const { username, followersText } = props;
    return (
      <MediaFooter
        heading={`@${username}`}
        icon={
          <div
            aria-hidden
            className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045]"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24">
              <rect height="20" rx="5" stroke="#fff" strokeWidth="2" width="20" x="2" y="2" />
              <circle cx="12" cy="12" r="5" stroke="#fff" strokeWidth="2" />
              <circle cx="17.5" cy="6.5" fill="#fff" r="1.5" />
            </svg>
          </div>
        }
      >
        <span>{followersText}</span>
        <span className="bg-[#4295ed] px-2 py-0.5">Follow me</span>
      </MediaFooter>
    );
  },
});
