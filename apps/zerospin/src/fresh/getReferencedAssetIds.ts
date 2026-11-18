import type { creatorFileIdSchema } from "@qrk.sh/bricks/creatorFile/creatorFileId";
import { getImageReferencedAssetId } from "@qrk.sh/bricks/modules/image/definition/v4";
import { getCarouselReferencedAssetIds } from "@qrk.sh/bricks/modules/imageCarousel/definition";
import type { pageSnapshotSchema } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/pageSnapshotSchema";

export function getReferencedAssetIds(content: typeof pageSnapshotSchema.Type) {
  const placedBrickIds = new Set(
    content.walls
      .flatMap((wall) => wall.sections)
      .flatMap((section) => section.stacks)
      .flatMap((stack) => stack.rows)
      .flatMap((row) => row.placements)
      .map((placement) => placement.brickId),
  );
  const referencedAssetIds = new Set<typeof creatorFileIdSchema.Type>();
  for (const brick of content.bricks) {
    if (!placedBrickIds.has(brick.id)) continue;
    if (brick.moduleId === "image") {
      const assetId = getImageReferencedAssetId(brick.brickState);
      if (assetId !== undefined) referencedAssetIds.add(assetId);
    } else if (brick.moduleId === "image-carousel") {
      for (const assetId of getCarouselReferencedAssetIds(brick.brickState)) {
        referencedAssetIds.add(assetId);
      }
    }
  }
  return [...referencedAssetIds].sort();
}
