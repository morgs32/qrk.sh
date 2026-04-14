import { BrickFrame } from "../../BrickFrame";
import { BlackCircleGraphic } from "./BlackCircleGraphic";

export function BlackCircle2x2() {
  return (
    <BrickFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <BlackCircleGraphic />
    </BrickFrame>
  );
}
