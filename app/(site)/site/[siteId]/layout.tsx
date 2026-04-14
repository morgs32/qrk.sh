import { Suspense } from "react";
import Link from "next/link";
import { HomeShell } from "@/components/home/HomeShell";

export default async function SiteLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}>) {
  const { siteId } = await params;

  return (
    <div className="h-screen overflow-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6">
        <Link href={`/site/${siteId}`} className="text-sm font-medium">
          Garlott
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/work" className="text-xs transition-opacity hover:opacity-70">
            Work
          </Link>
          <Link href="/about" className="text-xs transition-opacity hover:opacity-70">
            About
          </Link>
          <Link href="/follow" className="text-xs transition-opacity hover:opacity-70">
            Follow
          </Link>
        </nav>
        <button
          type="button"
          className="rounded-full bg-foreground px-3 py-1.5 text-[10px] text-background transition-opacity hover:opacity-90"
        >
          START A PROJECT
        </button>
      </header>

      <Suspense fallback={null}>
        <HomeShell />
      </Suspense>
      {children}
    </div>
  );
}
