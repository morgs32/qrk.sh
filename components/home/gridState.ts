import type {
  AlignmentByBreakpoint,
  HiddenByBreakpoint,
  IGridSeed
} from '@/components/home/useGridStore';
import { homepageTiles } from './tiles';

export const gridConfig: {
  alignmentByBreakpoint: AlignmentByBreakpoint;
  hiddenByBreakpoint: HiddenByBreakpoint;
} = {
  alignmentByBreakpoint: {
    lg: 'left',
    md: 'left',
    sm: 'left'
  },
  hiddenByBreakpoint: {
    lg: [],
    md: [],
    sm: []
  }
};

export const WORK_ITEMS_SEED = [
  { name: 'Blanchette', category: 'Identity' },
  { name: 'Yalika Bay Tower Station', category: 'Identity' },
  { name: 'Little Phil App', category: 'Identity' },
  { name: 'Banka', category: 'Identity' },
  { name: 'Used Venue Garage', category: 'Identity' },
  { name: 'Yarrawee Place Identity', category: 'Identity' },
  { name: 'Yarrawee Place Signage', category: 'Identity' },
  { name: 'Kane Identity', category: 'Identity' },
  { name: 'Southland Regional Art Gallery', category: 'Identity' },
  { name: 'Pan Andino', category: 'Packaging' },
  { name: 'Souki Oil', category: 'Identity' },
  { name: 'Buddy Johnson', category: 'Identity' },
  { name: 'Piccoli', category: 'Identity' },
  { name: "Sydney New Year's Eve", category: 'Identity' },
  { name: 'Type And Fonts', category: 'Identity' },
  { name: 'Benvito', category: 'Identity' },
  { name: 'City Planning Authority', category: 'Identity' },
  { name: 'Attrakt Identity', category: 'Identity' },
  { name: 'Joey Ramone', category: 'Identity' },
  { name: 'Sally Scott', category: 'Typography' },
  { name: 'The Code', category: 'Identity' },
  { name: 'Rio Carmen', category: 'Identity' },
  { name: 'Jarvis Bell', category: 'Photography' },
  { name: 'Artwork Shrines', category: 'Identity' },
  { name: 'Civic exhibition', category: 'Identity' },
  { name: 'Syllabutterpark', category: 'Publishing' },
  { name: 'SLM Launch', category: 'Big Image' },
  { name: 'Almenada Primary Mercurio', category: 'Publishing' },
  { name: 'Year of The Rainbow', category: 'Publishing' },
  { name: 'Desert Atlas', category: 'Publishing' },
  { name: 'Happy Home', category: 'Identity' },
  { name: 'Made Nice Illustration', category: 'Identity' },
  { name: 'Good Reasons Awards 2017', category: 'Identity' },
  { name: 'The Premise Main Identity', category: 'Identity' },
  { name: 'Azerbaijan Record', category: 'Identity' },
  { name: 'ADI Open Sydney 2023', category: 'Identity' },
  { name: 'Good Fortune Awards 2018', category: 'Identity' },
  { name: 'All Home', category: 'Identity' },
  { name: 'Charing Business', category: 'Identity' },
  { name: 'Bopha Plus Project', category: 'Big Image' },
  { name: 'Matrimoji Identity', category: 'Identity' },
  { name: 'Matthew Calico Interop', category: 'Identity' },
  { name: 'Nowra', category: 'Identity' },
  { name: 'Aspinal Review', category: 'Identity' },
  { name: 'The Architects Bookshop', category: 'Identity' },
  { name: 'Perl Tangara Conference', category: 'Identity' }
] as const;

const textTile4x1 = homepageTiles.find(
  (t) => t.def.collectionId === 'text-tile' && t.def.w === 4 && t.def.h === 1
);
if (!textTile4x1) {
  throw new Error('Homepage catalog must include text-tile 4×1 variant');
}
const textTile4x1Def = textTile4x1.def;

export const gridSeed: IGridSeed = {
  tileTypes: homepageTiles.map((tile) => ({ tileDef: tile.def })),
  config: gridConfig,
  autoSeedExcludeCollectionIds: ['text-tile'],
  explicitInstances: WORK_ITEMS_SEED.map((item, index) => ({
    instanceId: `text-tile-work--${index}`,
    tileDef: textTile4x1Def,
    text: {
      title: item.name,
      category: item.category,
      href: '#'
    }
  }))
};
