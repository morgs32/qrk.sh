/* oxlint-disable next/no-html-link-for-pages -- Home belongs to the separate web zone and requires a document navigation. */
import { UserButton } from "@clerk/nextjs";
import { Silkscreen } from "next/font/google";
import { Skeleton } from "@/components/ui/skeleton";

const silkscreen = Silkscreen({ subsets: ["latin"], weight: "400" });

export function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-16 @container border-b border-border bg-background"
      data-testid="dashboard-navbar"
    >
      <div className="qrk-responsive-insets flex h-full w-full items-center justify-between [padding-inline:var(--qrk-inset-inline)]">
        <a href="/" aria-label="Home" className={`${silkscreen.className} text-lg`}>
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
