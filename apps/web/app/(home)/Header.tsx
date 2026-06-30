"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "../../components/ui/button";

export function Header() {
  const router = useRouter();
  const { isSignedIn, user } = useUser();
  const username = user?.username;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <Link href="/" aria-label="Home" className="inline-flex items-end gap-2">
        <Image src="/qrk-sh.svg" alt="QRK.SH" width={48} height={11} className="h-4 w-auto" />
        <span className="text-xs leading-none text-muted-foreground">(get quirky with it)</span>
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
