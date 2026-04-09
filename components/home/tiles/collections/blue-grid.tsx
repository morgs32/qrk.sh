import { TileFrame } from '../TileFrame';

export function BlueGridTile() {
  return (
    <TileFrame backgroundClassName="bg-[#3B7FBD]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <rect x="15" y="15" width="30" height="30" fill="currentColor" />
        <rect x="55" y="15" width="30" height="30" fill="currentColor" />
        <rect x="15" y="55" width="30" height="30" fill="currentColor" />
        <rect x="55" y="55" width="30" height="30" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export const blueGridCollection = {
  collectionId: 'blue-grid',
  collectionLabel: 'Blue grid',
  Component: BlueGridTile
} as const;
