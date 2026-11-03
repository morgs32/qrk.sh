import { makeComponentView } from "../make/makeComponentView";
import { linkCardComponentMetadata } from "@qrk.sh/zerospin/src/modules/link/generator/LinkCardComponentMetadata";

export const linkCardView = makeComponentView(linkCardComponentMetadata, {
  component(props) {
    const { children } = props;
    return (
      <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-white">{children}</div>
    );
  },
});
