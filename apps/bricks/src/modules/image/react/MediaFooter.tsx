import { MediaFooter } from "../../../components/MediaFooter";
import { makeComponentView } from "../../react/makeComponentView";
import { mediaFooterComponentMetadata } from "../definition/generator/MediaFooterComponentMetadata";

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
