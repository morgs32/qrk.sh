/* oxlint-disable next/no-html-link-for-pages -- Home belongs to the separate web zone and requires a document navigation. */
import { UserButton } from "@clerk/nextjs";
import { Skeleton } from "@/components/ui/skeleton";

export function Header() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6"
      data-testid="dashboard-navbar"
    >
      <a href="/" aria-label="Home" className="font-[family-name:var(--font-silkscreen)] text-lg">
        qrk.sh
      </a>
      <div className="size-10">
        <UserButton
          fallback={<Skeleton className="size-10 rounded-full" aria-label="Loading account" />}
          appearance={{ elements: { userButtonAvatarBox: "!size-10" } }}
        />
      </div>
    </header>
  );
}
