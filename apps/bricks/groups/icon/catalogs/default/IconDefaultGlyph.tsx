import { BrickFrame } from "../../../../BrickFrame";
import { PinkAsteriskGraphic } from "./PinkAsteriskGraphic";

export function IconDefaultGlyph(props: { data: { name: string; svg: string } }) {
  return (
    <BrickFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <PinkAsteriskGraphic data={props.data} />
    </BrickFrame>
  );
}
