import { BrickFrame } from "../../BrickFrame";
import { BlueGridGraphic } from "./BlueGridGraphic";

export function BlueGrid2x2() {
  return (
    <BrickFrame backgroundClassName="bg-[#3B7FBD]" textClassName="text-black">
      <BlueGridGraphic />
    </BrickFrame>
  );
}
