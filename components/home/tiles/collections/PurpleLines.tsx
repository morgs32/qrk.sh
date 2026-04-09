import { TileFrame } from '../TileFrame';

export function PurpleLinesTile() {
  return (
    <TileFrame backgroundClassName="bg-[#8B7BB5]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-20 w-20">
        <rect x="20" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="35" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="50" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="65" y="15" width="8" height="70" rx="4" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export const purpleLinesCollection = {
  collectionId: 'purple-lines',
  collectionLabel: 'Purple lines',
  Component: PurpleLinesTile
} as const;
