"use client";

import { useUser } from "@clerk/nextjs";
import { useParams } from "next/navigation";

import { ComposeDrawerTiptapBlock } from "./ComposeDrawerTiptapBlock";
import { Button } from "@/components/ui/button";
import { useSiteStore } from "../../../siteStore";

export function ComposeDrawerTiptap() {
  const params = useParams<{ siteId: string; pageId: string }>();
  const { user } = useUser();
  const blocks = useSiteStore((state) =>
    user === null || user === undefined
      ? undefined
      : state.owners[user.id]?.sites[params.siteId]?.pages[params.pageId]?.composeBlocks,
  );
  const addComposeBlock = useSiteStore((state) => state.addComposeBlock);

  if (user === null || user === undefined || blocks === undefined) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block) => (
        <ComposeDrawerTiptapBlock key={block.id} id={block.id} initialContent={block.content} />
      ))}
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
