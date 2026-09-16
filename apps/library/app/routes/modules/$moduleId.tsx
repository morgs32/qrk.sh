import { Outlet, createFileRoute, notFound, useLocation } from "@tanstack/react-router";
import { OrderedBody } from "@qrk.sh/web/library/OrderedBody";
import { OrderedOutline } from "@qrk.sh/web/library/OrderedOutline";

import { BREAKPOINTS } from "../../../lib/breakpoints";
import { modulesHash } from "../../../lib/modulesHash";

export const Route = createFileRoute("/modules/$moduleId")({
  beforeLoad: ({ params }) => {
    if (modulesHash[params.moduleId] === undefined) {
      throw notFound();
    }
  },
  component: ModulePage,
});

function ModulePage() {
  const location = useLocation();
  const { moduleId } = Route.useParams();
  const brickModule = modulesHash[moduleId];

  if (!brickModule) {
    throw notFound();
  }

  const isBrickPage = location.pathname.split("/").filter(Boolean).length > 2;
  const sections: Array<{
    label: string;
    tone: string;
    children?: Array<{ label: string; tone: string }>;
  }> = [];
  if (isBrickPage) {
    sections.push({ label: "Preview", tone: "active" });
    sections.push({ label: "Configuration", tone: "active" });
    sections.push({ label: "Options", tone: "active" });
    sections.push({ label: "Brick Definition", tone: "active" });
  } else {
    sections.push({ label: "Module", tone: "active" });
    sections.push({
      label: "Previews",
      tone: "active",
      children: BREAKPOINTS.map((entry) => ({ label: entry.id, tone: "active" })),
    });
    if (brickModule.catalog !== undefined) {
      sections.push({ label: "Generate spec", tone: "active" });
    }
    sections.push({ label: "Configuration", tone: "active" });
    if (brickModule.component.options?.form !== undefined) {
      sections.push({ label: "Options", tone: "active" });
    }
    sections.push({ label: "Brick Definition", tone: "active" });
  }

  return (
    <div className="flex flex-col gap-8 p-6 lg:flex-row lg:gap-10 lg:p-8">
      <aside className="hidden shrink-0 self-start lg:sticky lg:top-0 lg:block">
        <OrderedOutline sections={sections} />
      </aside>
      <div className="min-w-0 flex-1">
        <OrderedBody showAnchors>
          <Outlet key={`${location.pathname}${location.searchStr}`} />
        </OrderedBody>
      </div>
    </div>
  );
}
