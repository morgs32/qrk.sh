import { BrickFrame } from "../../BrickFrame";
import { BlueGridGraphic } from "./BlueGridGraphic";

export function BlueGrid1x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#3B7FBD]" textClassName="text-black">
      <BlueGridGraphic />
    </BrickFrame>
  );
}
