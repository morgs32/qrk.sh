import type { ComponentType, ReactNode } from 'react';
import type {
  AlignmentByBreakpoint,
  HiddenByBreakpoint,
  TileSize
} from '@/lib/stores/portfolio-grid-store';

type TileFrameProps = {
  backgroundClassName: string;
  textClassName: string;
  children?: ReactNode;
};

function TileFrame({
  backgroundClassName,
  textClassName,
  children
}: TileFrameProps) {
  return (
    <div
      className={`${backgroundClassName} ${textClassName} flex h-full w-full select-none items-center justify-center overflow-hidden`}
    >
      {children}
    </div>
  );
}

export function OrangeFlagTile() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path d="M30 20 L30 80 M30 20 L70 35 L30 50" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export function BlackCircleTile() {
  return (
    <TileFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <div className="h-20 w-20 rounded-full bg-current" />
    </TileFrame>
  );
}

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

export function BlueGridTile() {
  return (
    <TileFrame backgroundClassName="bg-[#3B7FBD]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <rect x="15" y="15" width="30" height="30" fill="currentColor" />
        <rect x="55" y="15" width="30" height="30" fill="currentColor" />
        <rect x="15" y="55" width="30" height="30" fill="currentColor" />
        <rect x="55" y="55" width="30" height="30" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export function CreamBenchTile() {
  return (
    <TileFrame
      backgroundClassName="bg-[#F5F0E6]"
      textClassName="text-foreground"
    >
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <rect x="20" y="50" width="25" height="30" fill="currentColor" />
        <rect x="55" y="30" width="25" height="50" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export function GreenGLogoTile() {
  return (
    <TileFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path
          d="M70 30 Q30 30 30 50 Q30 70 50 70 L70 70 L70 50 L50 50"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
        />
      </svg>
    </TileFrame>
  );
}

export function CreamSquareTile() {
  return (
    <TileFrame
      backgroundClassName="bg-[#F5F0E6]"
      textClassName="text-foreground"
    >
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

export function BlackMLogoTile() {
  return (
    <TileFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <path
          d="M20 70 L20 30 L35 50 L50 30 L50 70 M50 70 L50 30 L65 50 L80 30 L80 70"
          fill="currentColor"
        />
      </svg>
    </TileFrame>
  );
}

export function OrangeBlockTile() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-16 w-16">
        <rect x="20" y="20" width="30" height="60" fill="currentColor" />
        <rect x="55" y="20" width="25" height="30" fill="currentColor" />
        <rect x="55" y="55" width="25" height="25" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

export function PurpleLinesTile() {
  return (
    <TileFrame backgroundClassName="bg-[#8B7BB5]" textClassName="text-black">
      <svg viewBox="0 0 100 100" className="h-20 w-20">
        <rect x="20" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="35" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="50" y="15" width="8" height="70" rx="4" fill="currentColor" />
        <rect x="65" y="15" width="8" height="70" rx="4" fill="currentColor" />
      </svg>
    </TileFrame>
  );
}

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

export function GreenEmptyTile() {
  return (
    <TileFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black" />
  );
}

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

type HomepageTileDefinition = {
  id: string;
  size: TileSize;
  Component: ComponentType;
};

export const homepageTiles: HomepageTileDefinition[] = [
  { id: 'orange-flag', size: '2x2', Component: OrangeFlagTile },
  { id: 'black-circle', size: '2x2', Component: BlackCircleTile },
  { id: 'green-arch', size: '2x2', Component: GreenArchTile },
  { id: 'blue-grid', size: '2x2', Component: BlueGridTile },
  { id: 'cream-bench', size: '2x2', Component: CreamBenchTile },
  { id: 'green-g-logo', size: '2x2', Component: GreenGLogoTile },
  { id: 'cream-square', size: '2x2', Component: CreamSquareTile },
  { id: 'pink-dots', size: '2x2', Component: PinkDotsTile },
  { id: 'black-m-logo', size: '2x2', Component: BlackMLogoTile },
  { id: 'orange-block', size: '2x2', Component: OrangeBlockTile },
  { id: 'purple-lines', size: '2x2', Component: PurpleLinesTile },
  { id: 'pink-asterisk', size: '2x2', Component: PinkAsteriskTile },
  { id: 'green-empty', size: '2x2', Component: GreenEmptyTile },
  { id: 'green-cross', size: '2x2', Component: GreenCrossTile }
];

export const homepageGridConfig: {
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
