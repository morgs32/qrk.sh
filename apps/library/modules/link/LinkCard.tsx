import { makeComponentView } from "../../make/makeComponentView";
import { linkCardComponent } from "./generator/LinkCardComponent";

export const linkCardView = makeComponentView(linkCardComponent, {
  component(props) {
    const { children } = props;
    return (
      <div className="flex h-full w-full min-h-0 gap-4 overflow-hidden bg-sky-50">{children}</div>
    );
  },
});
