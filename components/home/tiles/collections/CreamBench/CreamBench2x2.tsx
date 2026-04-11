import { TileFrame } from "../../TileFrame";
import { CreamBenchGraphic } from "./CreamBenchGraphic";

export function CreamBench2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamBenchGraphic />
    </TileFrame>
  );
}
