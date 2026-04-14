import { Suspense } from "react";
import { Header } from "./Header";
import { SiteSlotColumns } from "./SiteSlotColumns";
import { MainColumns } from "./MainColumns";

export default async function SiteLayout({
  children,
  left,
  right,
  toolbar,
  params,
}: Readonly<{
  children: React.ReactNode;
  left: React.ReactNode;
  right: React.ReactNode;
  toolbar: React.ReactNode;
  params: Promise<{ siteId: string }>;
}>) {
  const { siteId } = await params;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header siteId={siteId} />

      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>{children}</Suspense>
        <MainColumns />
        <SiteSlotColumns
          left={<Suspense fallback={null}>{left}</Suspense>}
          right={<Suspense fallback={null}>{right}</Suspense>}
        />
        <Suspense fallback={null}>{toolbar}</Suspense>
      </div>
    </div>
  );
}
