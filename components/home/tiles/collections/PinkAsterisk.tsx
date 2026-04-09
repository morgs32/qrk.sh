import { TileFrame } from '../TileFrame';

export function PinkAsteriskTile() {
  return (
    <TileFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path
          d="M50 20 L50 80 M20 35 L80 65 M20 65 L80 35"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
    </TileFrame>
  );
}

export const pinkAsteriskCollection = {
  collectionId: 'pink-asterisk',
  collectionLabel: 'Pink asterisk',
  Component: PinkAsteriskTile
} as const;
