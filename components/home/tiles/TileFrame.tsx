import type { ReactNode } from 'react';

type TileFrameProps = {
  backgroundClassName: string;
  textClassName: string;
  children?: ReactNode;
};

export function TileFrame({
  backgroundClassName,
  textClassName,
  children
}: TileFrameProps) {
  return (
    <div
      className={`${backgroundClassName} ${textClassName} flex h-full w-full select-none items-center justify-center overflow-hidden`}
    >
      {children}
    </div>
  );
}
