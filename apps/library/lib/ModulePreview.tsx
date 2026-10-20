import { useContext, type ReactNode } from "react";

import { BrickWrapper } from "../components/brick/BrickWrapper";
import { BrickCardStyleContext } from "./BrickCardStyleContext";
import { BREAKPOINTS } from "./breakpoints";
import { modulesHash } from "./modulesHash";

export function ModulePreview(props: {
  brickModule: (typeof modulesHash)[keyof typeof modulesHash];
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  displayPlaceholders: boolean;
  moduleLink: ReactNode;
  moduleAction?: ReactNode;
}) {
  const { brickModule, breakpoint, displayPlaceholders, moduleLink, moduleAction } = props;
  const cardStyle = useContext(BrickCardStyleContext);
  const maxPerPage = brickModule.maxPerPage;
  const view = brickModule.viewFor(breakpoint);
  const Component = view.component;
  const Placeholder = brickModule.placeholder;
  const entry = BREAKPOINTS.find((row) => row.id === breakpoint);
  if (entry === undefined) throw new Error(`Unknown breakpoint: ${breakpoint}`);

  return (
    <div
      data-module-entry={brickModule.id}
      className="flex h-full min-h-0 w-max shrink-0 flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 bg-zinc-100"
    >
      <h2 className="sticky top-0 z-10 m-0 shrink-0 bg-inherit px-8 py-4 font-normal">
        {moduleLink}
      </h2>
      <div className="px-8 pb-16">
        {maxPerPage !== undefined ? (
          <p className="mb-3 mt-0 max-w-64 text-sm text-zinc-500">Limit: {maxPerPage} per page.</p>
        ) : null}
        <div
          data-brick-surface=""
          data-card-style={cardStyle}
          className="brick-hover-target relative shrink-0"
          style={{ width: Math.min(view.defaultWidth, entry.previewWidth) }}
        >
          <div className="absolute right-2 top-2 z-20">{moduleAction}</div>
          <BrickWrapper
            className="brick-hover-surface"
            data-module-representative={brickModule.def.moduleId}
          >
            {displayPlaceholders && Placeholder !== undefined ? (
              <Placeholder />
            ) : (
              <Component state={brickModule.def.state} />
            )}
          </BrickWrapper>
        </div>
      </div>
    </div>
  );
}
