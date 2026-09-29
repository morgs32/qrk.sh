import { MediaFooter } from "../../components/brick/MediaFooter";
import { makeComponentView } from "../../make/makeComponentView";
import { mediaFooterComponent } from "./generator/MediaFooterComponent";

export const mediaFooterView = makeComponentView(mediaFooterComponent, {
  component(props) {
    const { overline, heading, iconUrl, children } = props;
    return (
      <MediaFooter
        overline={overline ?? undefined}
        heading={heading ?? undefined}
        iconUrl={iconUrl !== null && iconUrl.length > 0 ? iconUrl : undefined}
      >
        {children}
      </MediaFooter>
    );
  },
});
