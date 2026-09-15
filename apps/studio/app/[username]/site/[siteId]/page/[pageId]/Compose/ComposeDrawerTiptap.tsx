"use client";

import { useUser } from "@clerk/react";
import { Schema } from "effect";

import { ComposeDrawerTiptapBlock } from "./ComposeDrawerTiptapBlock";
import { Button } from "@/components/ui/button";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { useSitePageDraftStore } from "../../../sitePageDraftStore";

const ParamsSchema = Schema.Struct({
  siteId: Schema.String,
  pageId: Schema.String,
});

export function ComposeDrawerTiptap() {
  const params = useValidatedParams(ParamsSchema);
  const { user } = useUser();
  const blocks = useSitePageDraftStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.composeBlocks,
  );
  const addComposeBlock = useSitePageDraftStore((state) => state.addComposeBlock);

  if (user === null || user === undefined || blocks === undefined) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {blocks.length === 0 ? (
        <div className="text-sm text-muted-foreground">No compose blocks yet.</div>
      ) : (
        blocks.map((block) => (
          <ComposeDrawerTiptapBlock key={block.id} id={block.id} initialContent={block.content} />
        ))
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => addComposeBlock(user.id, params.siteId, params.pageId)}
      >
        +
      </Button>
    </div>
  );
}
