import { makeComponentView } from "../../../make/makeComponentView";
import { swatchAndIconColorComponent } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/generator/SwatchAndIconColorComponent";

export const swatchAndIconColorView = makeComponentView(swatchAndIconColorComponent, {
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
