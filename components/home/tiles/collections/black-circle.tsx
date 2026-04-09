import { TileFrame } from '../TileFrame';

export function BlackCircleTile() {
  return (
    <TileFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <div className="h-20 w-20 rounded-full bg-current" />
    </TileFrame>
  );
}

export const blackCircleCollection = {
  collectionId: 'black-circle',
  collectionLabel: 'Black circle',
  Component: BlackCircleTile
} as const;
