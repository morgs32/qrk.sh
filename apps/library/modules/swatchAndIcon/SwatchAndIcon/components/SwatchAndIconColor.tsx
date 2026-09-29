import { makeComponentView } from "../../../../make/makeComponentView";
import { swatchAndIconColorComponent } from "../../generator/SwatchAndIconColorComponent";

export const swatchAndIconColorView = makeComponentView(swatchAndIconColorComponent, {
  component(props) {
    const { color, children } = props;
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ backgroundColor: color }}
      >
        {children}
      </div>
    );
  },
});
