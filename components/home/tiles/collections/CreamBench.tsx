import { TileFrame } from '../TileFrame';

export function CreamBenchTile() {
  return (
    <TileFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <rect x="20" y="50" width="25" height="30" fill="currentColor" />
        <rect x="55" y="30" width="25" height="50" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export const creamBenchCollection = {
  collectionId: 'cream-bench',
  collectionLabel: 'Cream bench',
  Component: CreamBenchTile
} as const;
