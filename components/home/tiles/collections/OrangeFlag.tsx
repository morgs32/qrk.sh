import { TileFrame } from '../TileFrame';

export function OrangeFlagTile() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path d="M30 20 L30 80 M30 20 L70 35 L30 50" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export const orangeFlagCollection = {
  collectionId: 'orange-flag',
  collectionLabel: 'Orange flag',
  Component: OrangeFlagTile
} as const;
