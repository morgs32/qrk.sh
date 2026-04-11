import Link from 'next/link';

export type TextTilePresentationProps = {
  title: string;
  category: string;
  href: string;
  w: number;
  h: number;
};

export function TextTilePresentation({
  title,
  category,
  href,
  w,
  h
}: TextTilePresentationProps) {
  const isWide = w === 4 && h === 1;

  return (
    <Link
      href={href}
      className={`flex h-full w-full flex-col justify-center bg-background/80 transition-opacity hover:opacity-70 ${
        isWide ? 'px-4 py-2' : 'p-4'
      }`}
    >
      <div className={`font-medium ${isWide ? 'text-sm' : 'text-base'}`}>{title}</div>
      <div className={`text-muted-foreground ${isWide ? 'text-xs' : 'text-sm'}`}>
        {category}
      </div>
    </Link>
  );
}
