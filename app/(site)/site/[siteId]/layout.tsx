import { Suspense } from "react";
import { Header } from "./Header";

export default async function SiteLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}>) {
  const { siteId } = await params;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header siteId={siteId} />

      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </div>
  );
}
