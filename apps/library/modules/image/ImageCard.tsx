import { BrickShell } from "../../components/brick/BrickShell";
import { makeComponentView } from "../../make/makeComponentView";
import { imageCardComponent } from "./generator/ImageCardComponent";

export const imageCardView = makeComponentView(imageCardComponent, {
  component(props) {
    const { children } = props;
    return <BrickShell className="min-w-[200px] overflow-hidden bg-white">{children}</BrickShell>;
  },
});
