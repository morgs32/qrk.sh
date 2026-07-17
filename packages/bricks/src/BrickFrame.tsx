import type { ReactNode } from "react";

type BrickFrameProps = {
  backgroundClassName: string;
  textClassName: string;
  children?: ReactNode;
};

export function BrickFrame({ backgroundClassName, textClassName, children }: BrickFrameProps) {
  return (
    <div
      className={`qrk-bricks ${backgroundClassName} ${textClassName} flex h-full w-full select-none items-center justify-center overflow-hidden`}
    >
      {children}
    </div>
  );
}
