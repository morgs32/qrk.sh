import { TileFrame } from '../TileFrame';

export function GreenArchTile() {
  return (
    <TileFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path
          d="M20 80 L20 50 Q20 20 50 20 Q80 20 80 50 L80 80 M40 80 L40 50 Q40 40 50 40 Q60 40 60 50 L60 80"
          fill="currentColor"
        />
      </svg>
    </TileFrame>
  );
}

export const greenArchCollection = {
  collectionId: 'green-arch',
  collectionLabel: 'Green arch',
  Component: GreenArchTile
} as const;
