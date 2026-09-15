import { Compose } from "../[username]/site/[siteId]/page/[pageId]/Compose/Compose";
import { ComposeToolbar } from "../[username]/site/[siteId]/Toolbars/ComposeToolbar";

export const handle = { toolbar: <ComposeToolbar key="Compose" /> };

export default function ComposeRoute() {
  return <Compose />;
}
