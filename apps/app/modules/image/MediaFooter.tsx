import { MediaFooter } from "../components/brick/MediaFooter";
import { makeComponentView } from "../make/makeComponentView";
import { mediaFooterComponentMetadata } from "@qrk.sh/zerospin/src/modules/image/generator/MediaFooterComponentMetadata";

export const mediaFooterView = makeComponentView(mediaFooterComponentMetadata, {
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
