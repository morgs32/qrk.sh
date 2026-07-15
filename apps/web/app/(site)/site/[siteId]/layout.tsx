"use client";

import { use } from "react";

import { ZerospinOwnerProvider } from "@/components/ZerospinOwner";
import { SiteHeader } from "./SiteHeader";
import { Toolbars } from "./Toolbars/Toolbars";
import { Drawers } from "./Drawers/Drawers";

export default function PageLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}>) {
  const { siteId } = use(params);

  return (
    <ZerospinOwnerProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <SiteHeader siteId={siteId} />

        <div className="min-h-0 flex-1">
          <Drawers />
          {children}
          <Toolbars />
        </div>
      </div>
    </ZerospinOwnerProvider>
  );
}
