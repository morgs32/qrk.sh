import { UserButton, useClerk } from "@clerk/react";
import { useClearSessionAuthentication } from "@zerospin/react/useClearSessionAuthentication";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@qrk.sh/bricks/components/skeleton";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

export function AccountMenu() {
  const clearAuthentication = useClearSessionAuthentication(userSessionDefinition);
  const { signOut } = useClerk();

  return (
    <div className="size-8 shrink-0">
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
  );
}
