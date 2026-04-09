import { TileFrame } from '../TileFrame';

export function OrangeBlockTile() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <rect x="20" y="20" width="30" height="60" fill="currentColor" />
        <rect x="55" y="20" width="25" height="30" fill="currentColor" />
        <rect x="55" y="55" width="25" height="25" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export const orangeBlocksCollection = {
  collectionId: 'orange-block',
  collectionLabel: 'Orange blocks',
  Component: OrangeBlockTile
} as const;
