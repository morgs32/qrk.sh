import { BREAKPOINTS } from "../../../../../../../lib/breakpoints";
import { modulesHash } from "../../../../../../../modules/modulesHash";
import { ModulePreview } from "./ModulePreview";

export function ModuleFilmstrip(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
  cardStyle: boolean;
}) {
  const { breakpoint, cardStyle } = props;
  return (
    <div
      aria-label="Brick modules"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain"
    >
      {Object.values(modulesHash).map((brickModule) => (
        <ModulePreview
          key={brickModule.id}
          brickModule={brickModule}
          breakpoint={breakpoint}
          cardStyle={cardStyle}
        />
      ))}
    </div>
  );
}
