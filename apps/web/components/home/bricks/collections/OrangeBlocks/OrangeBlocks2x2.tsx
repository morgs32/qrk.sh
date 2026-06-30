import { BrickFrame } from "../../BrickFrame";
import { OrangeBlocksGraphic } from "./OrangeBlocksGraphic";

export function OrangeBlocks2x2() {
  return (
    <BrickFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <OrangeBlocksGraphic />
    </BrickFrame>
  );
}
