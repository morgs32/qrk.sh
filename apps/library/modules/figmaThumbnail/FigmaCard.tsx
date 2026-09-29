import { BrickShell } from "../../components/brick/BrickShell";
import { makeComponentView } from "../../make/makeComponentView";
import { figmaCardComponent } from "./generator/FigmaCardComponent";

export const figmaCardView = makeComponentView(figmaCardComponent, {
  component(props) {
    const { children } = props;
    return <BrickShell className="min-w-[200px] overflow-hidden bg-white">{children}</BrickShell>;
  },
});
