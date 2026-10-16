import { makeWallSnapshot } from "@qrk.sh/library/makeWallSnapshot";

import type { PageSnapshotSchema } from "./pageSnapshotSchema";

export function makePageSnapshot(props: {
  page: Pick<typeof PageSnapshotSchema.Type, "slug" | "title" | "description">;
  bricks: Parameters<typeof makeWallSnapshot>[0]["bricks"];
  placements: Parameters<typeof makeWallSnapshot>[0]["placements"];
}): typeof PageSnapshotSchema.Type {
  const { page, bricks, placements } = props;

  return {
    slug: page.slug,
    title: page.title,
    description: page.description,
    wall: makeWallSnapshot({ bricks, placements }),
  };
}
