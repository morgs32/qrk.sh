import { BrickFrame } from "../../BrickFrame";
import { PinkDotsGraphic } from "./PinkDotsGraphic";

export function PinkDots2x2() {
  return (
    <BrickFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <PinkDotsGraphic />
    </BrickFrame>
  );
}
