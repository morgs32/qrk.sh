import { BrickFrame } from "../../BrickFrame";
import { CreamBenchGraphic } from "./CreamBenchGraphic";

export function CreamBench2x2() {
  return (
    <BrickFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamBenchGraphic />
    </BrickFrame>
  );
}
