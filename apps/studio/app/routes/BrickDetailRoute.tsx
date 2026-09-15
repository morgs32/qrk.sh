import { BrickDetail } from "../[username]/site/[siteId]/page/[pageId]/BrickDetail/BrickDetail";
import { SiteToolbar } from "../[username]/site/[siteId]/Toolbars/SiteToolbar";

export const handle = { toolbar: <SiteToolbar key="Site" /> };

export default function BrickDetailRoute() {
  return <BrickDetail />;
}
