import { useStateValue } from "@json-render/react";
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

export function ImageMediaFooterRegistry(props: Parameters<typeof mediaFooterView.RegistryComponent>[0]) {
  const round = useStateValue<boolean>("/round") === true;
  return round ? null : <mediaFooterView.RegistryComponent {...props} />;
}
