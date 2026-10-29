import type { IInferDecodedRow } from "@zerospin/shapes";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";
import { iconSvgGraphicView } from "./SwatchAndIcon/components/IconSvgGraphic";
import { swatchAndIconColorView } from "./SwatchAndIcon/components/SwatchAndIconColor";

export function SwatchAndIcon(props: {
  state: IInferDecodedRow<typeof swatchAndIconV1.stateShape>;
}) {
  const { state } = props;
  return (
    <swatchAndIconColorView.Component color={state.payload.color}>
      <iconSvgGraphicView.Component name={state.data.name} svg={state.data.svg} />
    </swatchAndIconColorView.Component>
  );
}
