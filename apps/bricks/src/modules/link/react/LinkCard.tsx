import { makeComponentView } from "../../react/makeComponentView";
import { linkCardComponentMetadata } from "../definition/generator/LinkCardComponentMetadata";

export const linkCardView = makeComponentView(linkCardComponentMetadata, {
  component(props) {
    const { children } = props;
    return (
      <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-white">{children}</div>
    );
  },
});
