import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/SwatchAndIconJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { swatchAndIconV1 } from "./swatchAndIconV1";
import { iconSvgGraphicView } from "./SwatchAndIcon/components/IconSvgGraphic";
import { swatchAndIconColorView } from "./SwatchAndIcon/components/SwatchAndIconColor";

export const swatchAndIconView = makeModuleView(swatchAndIconV1, {
  default: {
    component(props) {
      const { state } = props;
      return (
        <swatchAndIconColorView.Component color="#4A7C59">
          <iconSvgGraphicView.Component name={state.data.name} svg={state.data.svg} />
        </swatchAndIconColorView.Component>
      );
    },
    generator: { registry, defaultSpec },
  },
});
