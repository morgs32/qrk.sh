import { BrickShell } from "../../react/BrickShell";
import { makeComponentView } from "../../react/makeComponentView";
import { figmaCardComponentMetadata } from "../definition/generator/FigmaCardComponentMetadata";

export const figmaCardView = makeComponentView(figmaCardComponentMetadata, {
  component(props) {
    const { children } = props;
    return <BrickShell className="min-w-[200px] overflow-hidden bg-white">{children}</BrickShell>;
  },
});
