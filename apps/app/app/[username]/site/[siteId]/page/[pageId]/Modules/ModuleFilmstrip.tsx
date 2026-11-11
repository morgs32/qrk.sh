import { useLayoutEffect, useRef, useState } from "react";
import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { modulesHash } from "../../../../../../../modules/modulesHash";
import { ModulePreview } from "./ModulePreview";

export function ModuleFilmstrip(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
  verticalAtLg?: boolean;
}) {
  const { breakpoint, cardStyle, verticalAtLg = false } = props;
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [sidebarCardWidth, setSidebarCardWidth] = useState<number>();

  useLayoutEffect(() => {
    const filmstrip = filmstripRef.current;
    if (!verticalAtLg || filmstrip === null) return;
    const cardContent = filmstrip.querySelector("[data-brick-catalog-content]");
    if (cardContent === null) return;

    // Sidebar cards share the same padded column width.
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setSidebarCardWidth(
        width > 0 && filmstrip.closest("[data-workspace-sidebar]") !== null ? width : undefined,
      );
    });
    observer.observe(cardContent);
    return () => observer.disconnect();
  }, [verticalAtLg]);

  return (
    <div
      ref={filmstripRef}
      aria-label="Brick modules"
      className={`flex h-full min-h-0 w-full min-w-0 flex-row gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x touch-pan-y ${verticalAtLg ? "lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-x-auto lg:overscroll-y-contain" : ""}`}
    >
      {Object.values(modulesHash).map((brickModule) => (
        <ModulePreview
          key={brickModule.id}
          brickModule={brickModule}
          breakpoint={breakpoint}
          cardStyle={cardStyle}
          verticalAtLg={verticalAtLg}
          sidebarCardWidth={sidebarCardWidth}
        />
      ))}
    </div>
  );
}
