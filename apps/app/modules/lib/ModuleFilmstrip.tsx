import type { ReactNode } from "react";

import { BREAKPOINTS } from "./breakpoints";
import { modulesHash } from "./modulesHash";
import { ModulePreview } from "./ModulePreview";

export function ModuleFilmstrip(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
  renderModuleLink: (brickModule: (typeof modulesHash)[keyof typeof modulesHash]) => ReactNode;
  renderModuleAction?: (brickModule: (typeof modulesHash)[keyof typeof modulesHash]) => ReactNode;
}) {
  const { breakpoint, cardStyle, renderModuleLink, renderModuleAction } = props;

  return (
    <div
      aria-label="Brick modules"
      className="flex h-full min-h-0 w-full min-w-0 flex-row gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain bg-zinc-100 touch-pan-x touch-pan-y"
    >
      {Object.values(modulesHash).map((brickModule) => (
        <ModulePreview
          key={brickModule.id}
          brickModule={brickModule}
          breakpoint={breakpoint}
          cardStyle={cardStyle}
          moduleLink={renderModuleLink(brickModule)}
          moduleAction={renderModuleAction?.(brickModule)}
        />
      ))}
    </div>
  );
}
