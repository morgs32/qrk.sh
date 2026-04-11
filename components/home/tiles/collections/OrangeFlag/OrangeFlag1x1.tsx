import { TileFrame } from "../../TileFrame";
import { OrangeFlagGraphic } from "./OrangeFlagGraphic";

export function OrangeFlag1x1() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <OrangeFlagGraphic />
    </TileFrame>
  );
}
