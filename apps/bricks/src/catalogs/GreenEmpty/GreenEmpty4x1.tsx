import { BrickFrame } from "../../BrickFrame";

export function GreenEmpty4x1(props: { data: { color: string } }) {
  return (
    <BrickFrame backgroundClassName="bg-transparent" textClassName="text-black">
      <div className="h-full w-full" style={{ backgroundColor: props.data?.color ?? "#4A7C59" }} />
    </BrickFrame>
  );
}
