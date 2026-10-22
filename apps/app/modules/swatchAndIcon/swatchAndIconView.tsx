import { SwatchAndIconPlaceholder } from "./SwatchAndIconPlaceholder";
import { makeModuleView } from "../make/makeModuleView";
import { registry } from "./generator/SwatchAndIconJsonRenderRegistry";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { SwatchAndIconForm } from "./SwatchAndIconForm";
import { iconSvgGraphicView } from "./SwatchAndIcon/components/IconSvgGraphic";
import { swatchAndIconColorView } from "./SwatchAndIcon/components/SwatchAndIconColor";
import { SwatchAndIconLineIcon } from "./SwatchAndIconLineIcon";

export const swatchAndIconView = makeModuleView(swatchAndIconV1, {
  LineIcon: SwatchAndIconLineIcon,
  form: SwatchAndIconForm,
  variants: {
    default: {
      placeholder: SwatchAndIconPlaceholder,
      component(props) {
        const { state } = props;
        return (
          <swatchAndIconColorView.Component color={state.payload.color}>
            <iconSvgGraphicView.Component name={state.data.name} svg={state.data.svg} />
          </swatchAndIconColorView.Component>
        );
      },
      generator: { registry, defaultSpec: swatchAndIconV1.defaultSpec },
    },
  },
});
