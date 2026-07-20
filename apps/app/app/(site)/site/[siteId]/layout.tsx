"use client";

import { ZerospinOwnerProvider } from "@/components/ZerospinOwner";
import { SiteHeader } from "./SiteHeader";
import { Toolbars } from "./Toolbars/Toolbars";
import { Drawers } from "./Drawers/Drawers";

export default function PageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ZerospinOwnerProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <SiteHeader />

        <div className="min-h-0 flex-1">
          <Drawers />
          {children}
          <Toolbars />
        </div>
      </div>
    </ZerospinOwnerProvider>
  );
}
