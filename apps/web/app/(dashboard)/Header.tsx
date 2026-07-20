import Link from "next/link";
import { Silkscreen } from "next/font/google";
import { UserButton } from "@clerk/nextjs";

const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
});

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <Link href="/" aria-label="Home" className={`${silkscreen.className} text-lg`}>
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
