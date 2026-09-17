import { IconSvgGraphic } from "./SwatchAndIcon/components/IconSvgGraphic";
import { SwatchAndIconColor } from "./SwatchAndIcon/components/SwatchAndIconColor";

export function SwatchAndIconBrick(props: {
  data: { name: string; svg: string };
  breakpointOptions: unknown;
}) {
  const color =
    props.breakpointOptions !== null &&
    typeof props.breakpointOptions === "object" &&
    "color" in props.breakpointOptions &&
    typeof props.breakpointOptions.color === "string"
      ? props.breakpointOptions.color
      : "#4A7C59";
  return (
    <SwatchAndIconColor color={color}>
      <IconSvgGraphic data={{ name: props.data.name, svg: props.data.svg }} />
    </SwatchAndIconColor>
  );
}
