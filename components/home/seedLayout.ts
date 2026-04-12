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

/** Homepage grid: 14× 4×4 art row, then 46× full-width 8×2 text rows (`useGridLayoutStore` initial state). */
export const seedLayout: ILayout = [
  { i: "orange-flag--0", x: 0, y: 0, w: 4, h: 4, def: orangeFlagCollection.tiles["4x4"].def },
  { i: "black-circle--1", x: 4, y: 0, w: 4, h: 4, def: blackCircleCollection.tiles["4x4"].def },
  { i: "green-arch--2", x: 0, y: 4, w: 4, h: 4, def: greenArchCollection.tiles["4x4"].def },
  { i: "blue-grid--3", x: 4, y: 4, w: 4, h: 4, def: blueGridCollection.tiles["4x4"].def },
  { i: "cream-bench--4", x: 0, y: 8, w: 4, h: 4, def: creamBenchCollection.tiles["4x4"].def },
  { i: "green-g-logo--5", x: 4, y: 8, w: 4, h: 4, def: greenGCollection.tiles["4x4"].def },
  { i: "cream-square--6", x: 0, y: 12, w: 4, h: 4, def: creamSquareCollection.tiles["4x4"].def },
  { i: "pink-dots--7", x: 4, y: 12, w: 4, h: 4, def: pinkDotsCollection.tiles["4x4"].def },
  { i: "black-m-logo--8", x: 0, y: 16, w: 4, h: 4, def: blackMCollection.tiles["4x4"].def },
  { i: "orange-block--9", x: 4, y: 16, w: 4, h: 4, def: orangeBlocksCollection.tiles["4x4"].def },
  { i: "purple-lines--10", x: 0, y: 20, w: 4, h: 4, def: purpleLinesCollection.tiles["4x4"].def },
  {
    i: "pink-asterisk--11",
    x: 4,
    y: 20,
    w: 4,
    h: 4,
    def: pinkAsteriskCollection.tiles["4x4"].def,
  },
  { i: "green-empty--12", x: 0, y: 24, w: 4, h: 4, def: greenEmptyCollection.tiles["4x4"].def },
  { i: "green-cross--13", x: 4, y: 24, w: 4, h: 4, def: greenCrossCollection.tiles["4x4"].def },
  { i: "text-tile-work--0", x: 0, y: 28, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--1", x: 0, y: 30, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--2", x: 0, y: 32, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--3", x: 0, y: 34, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--4", x: 0, y: 36, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--5", x: 0, y: 38, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--6", x: 0, y: 40, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--7", x: 0, y: 42, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--8", x: 0, y: 44, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--9", x: 0, y: 46, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--10", x: 0, y: 48, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--11", x: 0, y: 50, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--12", x: 0, y: 52, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--13", x: 0, y: 54, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--14", x: 0, y: 56, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--15", x: 0, y: 58, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--16", x: 0, y: 60, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--17", x: 0, y: 62, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--18", x: 0, y: 64, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--19", x: 0, y: 66, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--20", x: 0, y: 68, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--21", x: 0, y: 70, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--22", x: 0, y: 72, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--23", x: 0, y: 74, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--24", x: 0, y: 76, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--25", x: 0, y: 78, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--26", x: 0, y: 80, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--27", x: 0, y: 82, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--28", x: 0, y: 84, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--29", x: 0, y: 86, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--30", x: 0, y: 88, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--31", x: 0, y: 90, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--32", x: 0, y: 92, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--33", x: 0, y: 94, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--34", x: 0, y: 96, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--35", x: 0, y: 98, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--36", x: 0, y: 100, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--37", x: 0, y: 102, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--38", x: 0, y: 104, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--39", x: 0, y: 106, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--40", x: 0, y: 108, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--41", x: 0, y: 110, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--42", x: 0, y: 112, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--43", x: 0, y: 114, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--44", x: 0, y: 116, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
  { i: "text-tile-work--45", x: 0, y: 118, w: 8, h: 2, def: textTileCollection.tiles["8x2"].def },
];
