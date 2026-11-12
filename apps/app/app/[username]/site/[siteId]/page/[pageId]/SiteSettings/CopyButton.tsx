"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@qrk.sh/bricks/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function CopyButton(props: { text: string; label?: string; inline?: boolean }) {
  const { text, label = "Copy share URL", inline = false } = props;
  const [isCopying, setIsCopying] = useState(false);
  const [didCopy, setDidCopy] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size={inline ? "icon-xs" : "icon"}
            variant={inline ? "ghost" : "secondary"}
            className={inline ? undefined : "size-8 shadow-sm"}
            aria-label={label}
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
            {didCopy ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
          </Button>
        }
      />
      <TooltipContent side="left" sideOffset={8}>
        {didCopy ? "Copied" : "Copy"}
      </TooltipContent>
    </Tooltip>
  );
}
