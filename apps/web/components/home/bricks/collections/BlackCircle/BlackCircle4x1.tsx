import { BrickFrame } from "../../BrickFrame";
import { BlackCircleGraphic } from "./BlackCircleGraphic";

export function BlackCircle4x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <BlackCircleGraphic />
    </BrickFrame>
  );
}
