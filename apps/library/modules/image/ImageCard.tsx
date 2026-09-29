import { makeComponentView } from "../../make/makeComponentView";
import { imageCardComponent } from "./generator/ImageCardComponent";

export const imageCardView = makeComponentView(imageCardComponent, {
  component(props) {
    const { children } = props;
    return (
      <div className="flex h-full w-full min-h-0 min-w-[200px] flex-col overflow-hidden">
        {children}
      </div>
    );
  },
});
