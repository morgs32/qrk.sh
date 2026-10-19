import { UserButton } from "@clerk/react";
import "@fontsource/silkscreen/400.css";
import { Skeleton } from "@/components/ui/skeleton";

export function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-16 @container border-b border-border bg-background"
      data-testid="dashboard-navbar"
    >
      <div className="qrk-responsive-insets flex h-full w-full items-center justify-between [padding-inline:var(--qrk-inset-inline)]">
        <a
          href={process.env.NEXT_PUBLIC_WEB_ORIGIN}
          aria-label="Home"
          className="text-lg"
          style={{ fontFamily: "Silkscreen, monospace" }}
        >
          QRK.SH
        </a>
        <div className="size-10">
          <UserButton
            fallback={<Skeleton className="size-10 rounded-full" aria-label="Loading account" />}
            appearance={{ elements: { userButtonAvatarBox: "!size-10" } }}
          />
        </div>
      </div>
    </header>
  );
}
