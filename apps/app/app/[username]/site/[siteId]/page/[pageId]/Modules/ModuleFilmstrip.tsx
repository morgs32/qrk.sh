import { useLayoutEffect, useRef, useState } from "react";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { modulesHash } from "../../../../../../../modules/modulesHash";
import { ModulePreview } from "./ModulePreview";

export function ModuleFilmstrip(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
}) {
  const { breakpoint, cardStyle } = props;
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [sidebarCardWidth, setSidebarCardWidth] = useState<number>();

  useLayoutEffect(() => {
    const filmstrip = filmstripRef.current;
    if (filmstrip === null) return;
    const cardContent = filmstrip.querySelector("[data-brick-catalog-content]");
    if (cardContent === null) return;

    // Sidebar cards share the same padded column width.
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setSidebarCardWidth(width > 0 ? width : undefined);
    });
    observer.observe(cardContent);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={filmstripRef}
      aria-label="Brick modules"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
    >
      {Object.values(modulesHash).map((brickModule) => (
        <ModulePreview
          key={brickModule.id}
          brickModule={brickModule}
          breakpoint={breakpoint}
          cardStyle={cardStyle}
          sidebarCardWidth={sidebarCardWidth}
        />
      ))}
    </div>
  );
}
