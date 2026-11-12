import { Link } from "@tanstack/react-router";
import { Button } from "@qrk.sh/bricks/components/button";
import { ArrowLeft } from "lucide-react";
import { AccountMenu } from "../../../../AccountMenu";
import { PublishSiteDialog } from "./PublishSiteDialog";

export function PageEditorNavbar(props: {
  username: string;
  siteId: `sit_${string}`;
  isPublished: boolean;
}) {
  const { username, siteId, isPublished } = props;

  return (
    <header className="sticky top-0 z-50 h-14 shrink-0 @container border-b border-border bg-background">
      <div className="qrk-responsive-insets flex h-full w-full items-center justify-between [padding-inline:var(--qrk-inset-inline)]">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/$username" params={{ username }} resetScroll={false} role="link" />}
        >
          <ArrowLeft aria-hidden="true" />
          Exit
        </Button>
        <div className="flex shrink-0 items-center gap-2">
          {!isPublished && <PublishSiteDialog siteId={siteId} />}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
