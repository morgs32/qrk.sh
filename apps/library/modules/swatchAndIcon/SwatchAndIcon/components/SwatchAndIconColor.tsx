import type { ReactNode } from "react";

export function SwatchAndIconColor(props: {
  color: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ backgroundColor: props.color }}
    >
      {props.children}
    </div>
  );
}
