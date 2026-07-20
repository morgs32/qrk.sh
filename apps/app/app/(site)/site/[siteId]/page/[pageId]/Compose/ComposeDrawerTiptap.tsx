"use client";

import { ComposeDrawerTiptapBlock } from "./ComposeDrawerTiptapBlock";
import { useComposeStore } from "./useComposeStore";
import { Button } from "@/components/ui/button";

export function ComposeDrawerTiptap() {
  const blocks = useComposeStore((s) => s.blocks);
  const addBlock = useComposeStore((s) => s.addBlock);

  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block) => (
        <ComposeDrawerTiptapBlock key={block.id} id={block.id} initialContent={block.content} />
      ))}
      <Button type="button" variant="outline" className="w-full" onClick={addBlock}>
        +
      </Button>
    </div>
  );
}
