import { BrickFrame } from "../../BrickFrame";
import { PinkAsteriskGraphic } from "./PinkAsteriskGraphic";

export function PinkAsterisk2x2() {
  return (
    <BrickFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <PinkAsteriskGraphic />
    </BrickFrame>
  );
}
