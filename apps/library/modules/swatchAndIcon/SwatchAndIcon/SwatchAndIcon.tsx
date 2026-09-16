import { IconSvgGraphic } from "./components/IconSvgGraphic";
import { SwatchAndIconColor } from "./components/SwatchAndIconColor";

export function SwatchAndIcon(props: {
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
