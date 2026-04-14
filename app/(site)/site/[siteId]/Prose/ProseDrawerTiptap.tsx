"use client";

import { ProseDrawerTiptapBlock } from "./ProseDrawerTiptapBlock";
import { useProseDrawerStore } from "../useProseDrawerStore";
import { Button } from "@/components/ui/button";

export function ProseDrawerTiptap() {
  const blocks = useProseDrawerStore((s) => s.blocks);
  const addBlock = useProseDrawerStore((s) => s.addBlock);

  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block) => (
        <ProseDrawerTiptapBlock key={block.id} id={block.id} initialContent={block.content} />
      ))}
      <Button type="button" variant="outline" className="w-full" onClick={addBlock}>
        +
      </Button>
    </div>
  );
}
