import { Suspense } from "react";
import { MainColumns } from "./MainColumns";

export default function SitePageLayout({
  children,
  leftDrawer,
  rightDrawer,
  toolbar,
}: Readonly<{
  children: React.ReactNode;
  leftDrawer: React.ReactNode;
  rightDrawer: React.ReactNode;
  toolbar: React.ReactNode;
}>) {
  return (
    <>
      <Suspense fallback={null}>{children}</Suspense>
      <MainColumns />
      <LeftDrawer>
        <Suspense fallback={null}>{leftDrawer}</Suspense>
      </LeftDrawer>
      <RightDrawer>
        <Suspense fallback={null}>{rightDrawer}</Suspense>
      </RightDrawer>
      <Suspense fallback={null}>{toolbar}</Suspense>
    </>
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
