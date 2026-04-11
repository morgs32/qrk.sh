import { TileFrame } from "../../TileFrame";
import { BlueGridGraphic } from "./BlueGridGraphic";

export function BlueGrid2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#3B7FBD]" textClassName="text-black">
      <BlueGridGraphic />
    </TileFrame>
  );
}
