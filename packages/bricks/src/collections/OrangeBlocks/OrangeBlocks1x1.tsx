import { BrickFrame } from "../../BrickFrame";
import { OrangeBlocksGraphic } from "./OrangeBlocksGraphic";

export function OrangeBlocks1x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <OrangeBlocksGraphic />
    </BrickFrame>
  );
}
