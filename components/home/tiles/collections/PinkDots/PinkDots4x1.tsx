import { TileFrame } from "../../TileFrame";
import { PinkDotsGraphic } from "./PinkDotsGraphic";

export function PinkDots4x1() {
  return (
    <TileFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <PinkDotsGraphic />
    </TileFrame>
  );
}
