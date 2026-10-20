import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/SwatchAndIconJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { swatchAndIconV1 } from "./swatchAndIconV1";
import { SwatchAndIconForm } from "./SwatchAndIconForm";
import { iconSvgGraphicView } from "./SwatchAndIcon/components/IconSvgGraphic";
import { swatchAndIconColorView } from "./SwatchAndIcon/components/SwatchAndIconColor";
import { SwatchAndIconLineIcon } from "./SwatchAndIconLineIcon";

export const swatchAndIconView = makeModuleView(swatchAndIconV1, {
  LineIcon: SwatchAndIconLineIcon,
  form: SwatchAndIconForm,
  default: {
    component(props) {
      const { state } = props;
      return (
        <swatchAndIconColorView.Component color={state.payload.color}>
          <iconSvgGraphicView.Component name={state.data.name} svg={state.data.svg} />
        </swatchAndIconColorView.Component>
      );
    },
    generator: { registry, defaultSpec },
  },
});
