import { TileFrame } from '../TileFrame';

export function CreamSquareTile() {
  return (
    <TileFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <rect
          x="25"
          y="25"
          width="50"
          height="50"
          rx="8"
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
        />
      </svg>
    </TileFrame>
  );
}

export const creamSquareCollection = {
  collectionId: 'cream-square',
  collectionLabel: 'Cream square',
  Component: CreamSquareTile
} as const;
