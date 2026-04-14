import { redirect } from "next/navigation";
import { DEFAULT_SITE_PAGE_ID } from "./Drawers";

export default async function SiteRootPage({
  params,
}: Readonly<{
  params: Promise<{ siteId: string }>;
}>) {
  const { siteId } = await params;
  redirect(`/site/${siteId}/page/${DEFAULT_SITE_PAGE_ID}`);
}
