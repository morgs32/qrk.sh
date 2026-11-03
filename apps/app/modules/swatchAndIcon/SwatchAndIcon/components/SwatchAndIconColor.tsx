import { makeComponentView } from "../../../make/makeComponentView";
import { swatchAndIconColorComponentMetadata } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/generator/SwatchAndIconColorComponentMetadata";

export const swatchAndIconColorView = makeComponentView(swatchAndIconColorComponentMetadata, {
  component(props) {
    const { color, children } = props;
    return (
      <div
        className="flex h-full min-h-16 w-full items-center justify-center"
        style={{ backgroundColor: color }}
      >
        {children}
      </div>
    );
  },
});
