import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useId, useState } from "react";

import { Button } from "./button";
import { Input } from "./Input";

export function ImageUploadInput(props: {
  label: string;
  imageUrl: string;
  onSelect: (file: File) => void;
  disabled?: boolean;
}) {
  const { label, imageUrl, onSelect, disabled = false } = props;
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="group grid grid-cols-[76px_minmax(0,1fr)] items-center gap-1">
      <span
        id={id}
        className="flex h-7 items-center text-xs font-medium text-muted-foreground group-focus-within:text-primary"
      >
        {label}
      </span>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          type="button"
          disabled={disabled}
          aria-labelledby={`${id} ${id}-image`}
          className="flex h-7 min-w-0 items-center justify-between gap-1 rounded-(--radius-form-input) bg-form-input px-2 text-xs outline-none hover:brightness-95 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <span id={`${id}-image`}>Image</span>
          {imageUrl && (
            <img src={imageUrl} alt="" className="size-5 shrink-0 rounded-[4px] object-cover" />
          )}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="qrk-bricks fixed top-1/2 left-1/2 z-50 grid w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-lg bg-background p-4 text-xs text-foreground shadow-lg">
            <Dialog.Title className="text-sm font-semibold">Image</Dialog.Title>
            <Dialog.Description className="sr-only">Choose an image to upload.</Dialog.Description>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close image dialog"
                className="absolute top-2 right-2 size-7"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </Dialog.Close>
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Current image"
                className="max-h-48 w-full rounded-md object-contain"
              />
            )}
            <Input
              type="file"
              aria-label="Choose image"
              accept="image/*"
              disabled={disabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file === undefined || !file.type.startsWith("image/")) return;
                onSelect(file);
                setOpen(false);
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
