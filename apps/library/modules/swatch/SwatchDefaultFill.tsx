import { BrickFrame } from "../../BrickFrame";

export function SwatchDefaultFill(props: { data: { color: string } }) {
  return (
    <BrickFrame backgroundClassName="bg-transparent" textClassName="text-black">
      <div className="h-full w-full" style={{ backgroundColor: props.data?.color ?? "#4A7C59" }} />
    </BrickFrame>
  );
}
