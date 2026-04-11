import type { ComponentType } from 'react';
import type { TileSize } from '@/lib/stores/portfolio-grid-store';

export type HomepageTileVariantSize = '1x1' | '2x2' | '4x1';

export type ITileCollection = {
  collectionId: string;
  collectionLabel: string;
  components: Record<HomepageTileVariantSize, ComponentType>;
};

export type HomepageTileDefinition = {
  typeId: string;
  collectionId: string;
  collectionLabel: string;
  label: string;
  size: TileSize;
  Component: ComponentType;
};
