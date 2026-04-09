import type { ComponentType } from 'react';
import type { TileSize } from '@/lib/stores/portfolio-grid-store';

export type HomepageTileCollection = {
  collectionId: string;
  collectionLabel: string;
  Component: ComponentType;
};

export type HomepageTileDefinition = {
  typeId: string;
  collectionId: string;
  collectionLabel: string;
  label: string;
  size: TileSize;
  Component: ComponentType;
};
