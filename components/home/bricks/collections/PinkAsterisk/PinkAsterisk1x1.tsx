import { BrickFrame } from "../../BrickFrame";
import { PinkAsteriskGraphic } from "./PinkAsteriskGraphic";

export function PinkAsterisk1x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <PinkAsteriskGraphic />
    </BrickFrame>
  );
}
