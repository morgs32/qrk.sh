import { TileFrame } from '../TileFrame';

export function GreenEmptyTile() {
  return <TileFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black" />;
}

export const greenEmptyCollection = {
  collectionId: 'green-empty',
  collectionLabel: 'Green empty',
  Component: GreenEmptyTile
} as const;
