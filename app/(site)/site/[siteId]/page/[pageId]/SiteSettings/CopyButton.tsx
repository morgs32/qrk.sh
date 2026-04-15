"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CopyButton({ text }: { text: string }) {
  const [isCopying, setIsCopying] = useState(false);
  const [didCopy, setDidCopy] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="pointer-events-auto size-8 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          aria-label="Copy published URL"
          disabled={isCopying}
          onClick={async () => {
            try {
              setIsCopying(true);
              await navigator.clipboard.writeText(text);
              setDidCopy(true);
              window.setTimeout(() => setDidCopy(false), 1200);
            } finally {
              setIsCopying(false);
            }
          }}
        >
          {didCopy ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8}>
        {didCopy ? "Copied" : "Copy"}
      </TooltipContent>
    </Tooltip>
  );
}

