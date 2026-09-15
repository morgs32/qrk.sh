import { IconSvgGraphic } from "./IconSvgGraphic";
import { SwatchAndIconColor } from "./SwatchAndIconColor";

export function SwatchAndIconGlyph(props: {
  breakpoint: "sm" | "md" | "lg" | "xl";
  options?: { color: string };
  data: { name: string; svg: string };
}) {
  return (
    <SwatchAndIconColor color={props.options?.color ?? "#4A7C59"}>
      <IconSvgGraphic data={props.data} />
    </SwatchAndIconColor>
  );
}
