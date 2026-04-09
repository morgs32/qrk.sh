import { TileFrame } from '../TileFrame';

export function GreenCrossTile() {
  return (
    <TileFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-12 w-12">
        <path
          d="M30 30 L45 50 L30 70 M70 30 L55 50 L70 70"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </TileFrame>
  );
}

export const greenCrossCollection = {
  collectionId: 'green-cross',
  collectionLabel: 'Green cross',
  Component: GreenCrossTile
} as const;
