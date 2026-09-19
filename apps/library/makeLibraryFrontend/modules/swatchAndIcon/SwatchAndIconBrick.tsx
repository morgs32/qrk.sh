import { IconSvgGraphic } from "./SwatchAndIcon/components/IconSvgGraphic";
import { SwatchAndIconColor } from "./SwatchAndIcon/components/SwatchAndIconColor";

export function SwatchAndIconBrick(props: {
  state: {
    payload: { hash: string };
    data: { name: string; svg: string };
  };
}) {
  return (
    <SwatchAndIconColor color="#4A7C59">
      <IconSvgGraphic data={{ name: props.state.data.name, svg: props.state.data.svg }} />
    </SwatchAndIconColor>
  );
}
