"use client";

import Link from "next/link";
import { Silkscreen } from "next/font/google";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "../../../components/ui/button";

const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
});

export function Header() {
  const router = useRouter();
  const { isSignedIn, user } = useUser();
  const username = user?.username;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <Link href="/" aria-label="Home" className={`${silkscreen.className} text-lg`}>
        qrk.sh
      </Link>
      {isSignedIn ? (
        username ? (
          <Button className="font-bold" asChild>
            <Link href={`/${username}`}>Dashboard</Link>
          </Button>
        ) : null
      ) : (
        <Button
          className="font-bold"
          onClick={() => {
            router.push("/sign-in");
          }}
        >
          START A PROJECT
        </Button>
      )}
    </header>
  );
}
