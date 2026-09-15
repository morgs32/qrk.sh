import { useRef, useState } from "react";

import { Button } from "../../components/ui/button";

const DEFAULT_IMAGE_SRC =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80";

export function ImageOptionsForm(props: {
  value: { src: string };
  onChange: (value: { src: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadSelectedFile() {
    const file = inputRef.current?.files?.[0];
    if (file === undefined) {
      setError("Choose an image file first");
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        message?: string;
        code?: string;
      } | null;
      if (!response.ok || body === null || typeof body.url !== "string") {
        throw new Error(body?.message ?? `Upload failed (${response.status})`);
      }
      props.onChange({ ...props.value, src: body.url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-3 px-4 py-5">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="image-src-url">
          Image URL
        </label>
        <input
          id="image-src-url"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={props.value.src}
          onChange={(event) => {
            props.onChange({ ...props.value, src: event.target.value });
          }}
          placeholder={DEFAULT_IMAGE_SRC}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="text-sm"
          aria-label="Choose image file"
        />
        <Button type="button" disabled={isUploading} onClick={() => void uploadSelectedFile()}>
          {isUploading ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {error !== null && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { DEFAULT_IMAGE_SRC };
