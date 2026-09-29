import { SiteSettings } from "@/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings";

export default function Page() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SiteSettings />
    </div>
  );
}
