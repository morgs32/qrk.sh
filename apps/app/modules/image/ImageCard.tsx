import { BrickShell } from "../components/brick/BrickShell";
import { makeComponentView } from "../make/makeComponentView";
import { imageCardComponentMetadata } from "@qrk.sh/zerospin/src/modules/image/generator/ImageCardComponentMetadata";

export const imageCardView = makeComponentView(imageCardComponentMetadata, {
  component(props) {
    const { children } = props;
    return <BrickShell className="min-w-[200px] overflow-hidden bg-white">{children}</BrickShell>;
  },
});
