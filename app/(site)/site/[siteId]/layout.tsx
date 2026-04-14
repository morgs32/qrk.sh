import { Header } from "./Header";
import { Toolbars } from "./Toolbars/Toolbars";
import { Drawers } from "./Drawers/Drawers";

export default async function PageLayout({
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
        <Drawers />
        {children}
        <Toolbars />
      </div>
    </div>
  );
}
