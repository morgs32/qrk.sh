import { TileFrame } from '../TileFrame';

export function BlackMLogoTile() {
  return (
    <TileFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path
          d="M20 70 L20 30 L35 50 L50 30 L50 70 M50 70 L50 30 L65 50 L80 30 L80 70"
          fill="currentColor"
        />
      </svg>
    </TileFrame>
  );
}

export const blackMCollection = {
  collectionId: 'black-m-logo',
  collectionLabel: 'Black M',
  Component: BlackMLogoTile
} as const;
