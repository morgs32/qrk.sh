import { Link } from "react-router";
import { UserButton } from "@clerk/react";

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <Link reloadDocument to="/" aria-label="Home" className="font-[Silkscreen] text-lg">
        qrk.sh
      </Link>
      <UserButton
        appearance={{
          elements: {
            userButtonAvatarBox: "!size-10",
          },
        }}
      />
    </header>
  );
}
