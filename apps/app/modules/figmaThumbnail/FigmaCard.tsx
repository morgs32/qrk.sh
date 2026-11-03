import { BrickShell } from "../components/brick/BrickShell";
import { makeComponentView } from "../make/makeComponentView";
import { figmaCardComponentMetadata } from "@qrk.sh/zerospin/src/modules/figmaThumbnail/generator/FigmaCardComponentMetadata";

export const figmaCardView = makeComponentView(figmaCardComponentMetadata, {
  component(props) {
    const { children } = props;
    return <BrickShell className="min-w-[200px] overflow-hidden bg-white">{children}</BrickShell>;
  },
});
