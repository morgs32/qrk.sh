import { Link } from "@tanstack/react-router";
import { Button } from "@qrk.sh/bricks/components/button";
import { ArrowLeft } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountMenu } from "../../../../AccountMenu";
import { BreakpointsToolbar } from "../../Toolbars/BreakpointsToolbar";
import { PublishSiteDialog } from "./PublishSiteDialog";

export function PageEditorNavbar(props: {
  username: string;
  siteId: `sit_${string}`;
  isPublished: boolean;
}) {
  const { username, siteId, isPublished } = props;

  return (
    <header className="sticky top-0 z-50 col-span-2 h-14 shrink-0 @container border-b border-border bg-background">
      <div className="qrk-responsive-insets grid h-full w-full grid-cols-[auto_1fr_auto] items-center gap-1 [padding-inline:var(--qrk-inset-inline)] sm:grid-cols-[1fr_auto_1fr]">
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          nativeButton={false}
          render={<Link to="/$username" params={{ username }} resetScroll={false} role="link" />}
        >
          <ArrowLeft aria-hidden="true" />
          Exit
        </Button>
        <div className="justify-self-center">
          <TooltipProvider delay={0}>
            <BreakpointsToolbar />
          </TooltipProvider>
        </div>
        <div className="flex shrink-0 items-center gap-1 justify-self-end sm:gap-2">
          {!isPublished && <PublishSiteDialog siteId={siteId} />}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
