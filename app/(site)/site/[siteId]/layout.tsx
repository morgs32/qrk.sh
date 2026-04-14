import { Suspense } from "react";
import { Header } from "./Header";
import { MainColumns } from "./MainColumns";

export default async function SiteLayout({
  children,
  leftDrawer,
  rightDrawer,
  toolbar,
  params,
}: Readonly<{
  children: React.ReactNode;
  leftDrawer: React.ReactNode;
  rightDrawer: React.ReactNode;
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
        <LeftDrawer>
          <Suspense fallback={null}>{leftDrawer}</Suspense>
        </LeftDrawer>
        <RightDrawer>
          <Suspense fallback={null}>{rightDrawer}</Suspense>
        </RightDrawer>
        <Suspense fallback={null}>{toolbar}</Suspense>
      </div>
    </div>
  );
}

function LeftDrawer(props: { children: React.ReactNode }) {
  const { children } = props;
  return <>{children}</>;
}

function RightDrawer(props: { children: React.ReactNode }) {
  const { children } = props;
  return <>{children}</>;
}
