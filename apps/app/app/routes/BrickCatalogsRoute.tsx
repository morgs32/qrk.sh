import { BrickCatalog } from "../[username]/site/[siteId]/page/[pageId]/BrickCatalog/BrickCatalog";
import { BrickCatalogToolbar } from "../[username]/site/[siteId]/Toolbars/BrickCatalogToolbar";

export const handle = { toolbar: <BrickCatalogToolbar key="BrickCatalog" /> };

export default function BrickCatalogsRoute() {
  return <BrickCatalog />;
}
