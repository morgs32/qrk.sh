import { TileFrame } from '../TileFrame';

export function PinkDotsTile() {
  return (
    <TileFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <div className="grid grid-cols-3 gap-3">
        {[...Array(9)].map((_, index) => (
          <div key={index} className="h-3 w-3 rounded-full bg-current" />
        ))}
      </div>
    </TileFrame>
  );
}

export const pinkDotsCollection = {
  collectionId: 'pink-dots',
  collectionLabel: 'Pink dots',
  Component: PinkDotsTile
} as const;
