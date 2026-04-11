import { TileFrame } from "../../TileFrame";
import { BlueGridGraphic } from "./BlueGridGraphic";

export function BlueGrid4x1() {
  return (
    <TileFrame backgroundClassName="bg-[#3B7FBD]" textClassName="text-black">
      <BlueGridGraphic />
    </TileFrame>
  );
}
