import { TileFrame } from '../TileFrame';

export function GreenGLogoTile() {
  return (
    <TileFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path
          d="M70 30 Q30 30 30 50 Q30 70 50 70 L70 70 L70 50 L50 50"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
        />
      </svg>
    </TileFrame>
  );
}

export const greenGCollection = {
  collectionId: 'green-g-logo',
  collectionLabel: 'Green G',
  Component: GreenGLogoTile
} as const;
