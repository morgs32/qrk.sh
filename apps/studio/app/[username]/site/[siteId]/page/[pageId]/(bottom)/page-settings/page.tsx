import { PageSettings } from "@/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings";

export default function Page() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageSettings />
    </div>
  );
}
