"use client";

import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";

export function Header() {
  const { user } = useUser();
  const username = user?.username;

  return (
    <header className="sticky top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <Link href={`/${username}`} aria-label="Home" className="inline-flex items-end gap-2">
        <Image src="/qrk-sh.svg" alt="QRK.SH" width={48} height={11} className="h-4 w-auto" />
        <span className="text-xs leading-none text-muted-foreground">(get quirky with it)</span>
      </Link>
    </header>
  );
}
