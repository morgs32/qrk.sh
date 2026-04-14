import { redirect } from "next/navigation";
import { DEFAULT_SITE_PAGE_ID } from "./Drawers/matchDrawerPathname";
import { pagePattern } from "./routePatterns";

export default async function SitePage({
  params,
}: Readonly<{
  params: Promise<{ siteId: string }>;
}>) {
  const { siteId } = await params;
  redirect(pagePattern.href({ siteId, pageId: DEFAULT_SITE_PAGE_ID }));
}
