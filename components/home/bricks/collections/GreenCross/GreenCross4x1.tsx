import { BrickFrame } from "../../BrickFrame";
import { GreenCrossGraphic } from "./GreenCrossGraphic";

export function GreenCross4x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black">
      <GreenCrossGraphic />
    </BrickFrame>
  );
}
