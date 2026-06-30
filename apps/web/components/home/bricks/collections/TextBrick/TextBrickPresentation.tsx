export type TextBrickPresentationProps = {
  title: string;
  category: string;
  w: number;
  h: number;
};

export function TextBrickPresentation({ title, category, w, h }: TextBrickPresentationProps) {
  const isWide = w === 4 && h === 1;

  return (
    <div
      className={`select-none flex h-full w-full flex-col justify-center bg-neutral-400 transition-colors duration-200 hover:bg-neutral-100 dark:bg-neutral-700 dark:hover:bg-neutral-500 shadow-[inset_0_1px_0_0_rgb(255_255_255),inset_0_-1px_0_0_rgb(255_255_255)] ${
        isWide ? "px-4 py-2" : "p-4"
      }`}
    >
      <div className={`font-medium ${isWide ? "text-sm" : "text-base"}`}>{title}</div>
      <div className={`text-muted-foreground ${isWide ? "text-xs" : "text-sm"}`}>{category}</div>
    </div>
  );
}
