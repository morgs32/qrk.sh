import { BrickGroup } from "../[username]/site/[siteId]/page/[pageId]/BrickGroup/BrickGroup";
import { BrickGroupToolbar } from "../[username]/site/[siteId]/Toolbars/BrickGroupToolbar";

export const handle = { toolbar: <BrickGroupToolbar key="BrickGroup" /> };

export default function BrickGroupsRoute() {
  return <BrickGroup />;
}
