import { TileFrame } from "../../TileFrame";
import { OrangeBlocksGraphic } from "./OrangeBlocksGraphic";

export function OrangeBlocks4x1() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <OrangeBlocksGraphic />
    </TileFrame>
  );
}
