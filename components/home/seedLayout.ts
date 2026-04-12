/* Never use an array to make any of this shit easy. */

import type { LayoutItem } from "react-grid-layout";

import { blackCircleCollection } from "@/components/home/tiles/collections/BlackCircle/BlackCircleCollection";
import { blackMCollection } from "@/components/home/tiles/collections/BlackMLogo/BlackMLogoCollection";
import { blueGridCollection } from "@/components/home/tiles/collections/BlueGrid/BlueGridCollection";
import { creamBenchCollection } from "@/components/home/tiles/collections/CreamBench/CreamBenchCollection";
import { creamSquareCollection } from "@/components/home/tiles/collections/CreamSquare/CreamSquareCollection";
import { greenArchCollection } from "@/components/home/tiles/collections/GreenArch/GreenArchCollection";
import { greenCrossCollection } from "@/components/home/tiles/collections/GreenCross/GreenCrossCollection";
import { greenEmptyCollection } from "@/components/home/tiles/collections/GreenEmpty/GreenEmptyCollection";
import { greenGCollection } from "@/components/home/tiles/collections/GreenGLogo/GreenGLogoCollection";
import { orangeBlocksCollection } from "@/components/home/tiles/collections/OrangeBlocks/OrangeBlocksCollection";
import { orangeFlagCollection } from "@/components/home/tiles/collections/OrangeFlag/OrangeFlagCollection";
import { pinkAsteriskCollection } from "@/components/home/tiles/collections/PinkAsterisk/PinkAsteriskCollection";
import { pinkDotsCollection } from "@/components/home/tiles/collections/PinkDots/PinkDotsCollection";
import { purpleLinesCollection } from "@/components/home/tiles/collections/PurpleLines/PurpleLinesCollection";
import { textTileCollection } from "@/components/home/tiles/collections/TextTile/TextTileCollection";
import type { ICollectionTileDef } from "@/components/home/tiles/types";

export type ILayoutItem = LayoutItem & { def: ICollectionTileDef };
export type ILayout = ILayoutItem[];

/** Mirrors grid seed shape: 14× 2×2 art row, then 46× full-width 4×1 rows (`gridState` / `useGridStore`). */
export const seedLayout: ILayout = [
  { i: "orange-flag--0", x: 0, y: 0, w: 2, h: 2, def: orangeFlagCollection.tiles["2x2"].def },
  { i: "black-circle--1", x: 2, y: 0, w: 2, h: 2, def: blackCircleCollection.tiles["2x2"].def },
  { i: "green-arch--2", x: 0, y: 2, w: 2, h: 2, def: greenArchCollection.tiles["2x2"].def },
  { i: "blue-grid--3", x: 2, y: 2, w: 2, h: 2, def: blueGridCollection.tiles["2x2"].def },
  { i: "cream-bench--4", x: 0, y: 4, w: 2, h: 2, def: creamBenchCollection.tiles["2x2"].def },
  { i: "green-g-logo--5", x: 2, y: 4, w: 2, h: 2, def: greenGCollection.tiles["2x2"].def },
  { i: "cream-square--6", x: 0, y: 6, w: 2, h: 2, def: creamSquareCollection.tiles["2x2"].def },
  { i: "pink-dots--7", x: 2, y: 6, w: 2, h: 2, def: pinkDotsCollection.tiles["2x2"].def },
  { i: "black-m-logo--8", x: 0, y: 8, w: 2, h: 2, def: blackMCollection.tiles["2x2"].def },
  { i: "orange-block--9", x: 2, y: 8, w: 2, h: 2, def: orangeBlocksCollection.tiles["2x2"].def },
  { i: "purple-lines--10", x: 0, y: 10, w: 2, h: 2, def: purpleLinesCollection.tiles["2x2"].def },
  {
    i: "pink-asterisk--11",
    x: 2,
    y: 10,
    w: 2,
    h: 2,
    def: pinkAsteriskCollection.tiles["2x2"].def,
  },
  { i: "green-empty--12", x: 0, y: 12, w: 2, h: 2, def: greenEmptyCollection.tiles["2x2"].def },
  { i: "green-cross--13", x: 2, y: 12, w: 2, h: 2, def: greenCrossCollection.tiles["2x2"].def },
  { i: "text-tile-work--0", x: 0, y: 14, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--1", x: 0, y: 15, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--2", x: 0, y: 16, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--3", x: 0, y: 17, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--4", x: 0, y: 18, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--5", x: 0, y: 19, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--6", x: 0, y: 20, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--7", x: 0, y: 21, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--8", x: 0, y: 22, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--9", x: 0, y: 23, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--10", x: 0, y: 24, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--11", x: 0, y: 25, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--12", x: 0, y: 26, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--13", x: 0, y: 27, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--14", x: 0, y: 28, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--15", x: 0, y: 29, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--16", x: 0, y: 30, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--17", x: 0, y: 31, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--18", x: 0, y: 32, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--19", x: 0, y: 33, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--20", x: 0, y: 34, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--21", x: 0, y: 35, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--22", x: 0, y: 36, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--23", x: 0, y: 37, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--24", x: 0, y: 38, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--25", x: 0, y: 39, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--26", x: 0, y: 40, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--27", x: 0, y: 41, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--28", x: 0, y: 42, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--29", x: 0, y: 43, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--30", x: 0, y: 44, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--31", x: 0, y: 45, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--32", x: 0, y: 46, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--33", x: 0, y: 47, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--34", x: 0, y: 48, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--35", x: 0, y: 49, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--36", x: 0, y: 50, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--37", x: 0, y: 51, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--38", x: 0, y: 52, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--39", x: 0, y: 53, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--40", x: 0, y: 54, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--41", x: 0, y: 55, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--42", x: 0, y: 56, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--43", x: 0, y: 57, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--44", x: 0, y: 58, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
  { i: "text-tile-work--45", x: 0, y: 59, w: 4, h: 1, def: textTileCollection.tiles["4x1"].def },
];
