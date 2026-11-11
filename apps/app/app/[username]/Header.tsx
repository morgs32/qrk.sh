import { UserButton, useClerk } from "@clerk/react";
import { useClearSessionAuthentication } from "@zerospin/react/useClearSessionAuthentication";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";
import "@fontsource/silkscreen/400.css";
import { Skeleton } from "@/components/ui/skeleton";

export function Header(props: { children?: ReactNode }) {
  const { children } = props;
  const clearAuthentication = useClearSessionAuthentication(userSessionDefinition);
  const { signOut } = useClerk();
  return (
    <header
      className="sticky top-0 z-50 h-14 shrink-0 @container border-b border-border bg-background lg:h-16"
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
        <div className="flex shrink-0 items-center gap-2">
          {children}
          <div className="size-8">
            <UserButton
              fallback={<Skeleton className="size-8 rounded-full" aria-label="Loading account" />}
              appearance={{
                elements: {
                  userButtonAvatarBox: "!size-8",
                  userButtonPopoverActionButton__signOut: "!hidden",
                },
              }}
            >
              <UserButton.MenuItems>
                <UserButton.Action
                  label="Sign out"
                  labelIcon={<LogOut />}
                  onClick={() => {
                    void clearAuthentication()
                      .then(() => signOut())
                      .catch(() => toast.error("Could not sign out. Please try again."));
                  }}
                />
              </UserButton.MenuItems>
            </UserButton>
          </div>
        </div>
      </div>
    </header>
  );
}
