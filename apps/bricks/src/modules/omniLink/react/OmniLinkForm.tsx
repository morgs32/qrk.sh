import { Button } from "@qrk.sh/bricks/components/button";
import type { BricksApi } from "@qrk.sh/bricks/rpc";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { useEffect, useRef, useState } from "react";

import { TextInput } from "../../../components/TextInput";

export function OmniLinkForm() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const activeRequest = useRef<AbortController>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function fetchData() {
    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setLoading(true);
    setError(undefined);
    setResult(undefined);
    try {
      using api = newSyncRpcSession<BricksApi>("/rpc");
      const close = () => api[Symbol.dispose]();
      request.signal.addEventListener("abort", close, { once: true });
      try {
        const response = await api.getOmniLinkData(url.trim());
        if (request.signal.aborted) return;
        if (response._tag === "Left") setError(response.left.message);
        else setResult(response.right);
      } finally {
        request.signal.removeEventListener("abort", close);
      }
    } catch {
      if (!request.signal.aborted) setError("Could not reach the lookup service. Try again.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return (
    <form
      className="mx-auto grid w-full max-w-3xl gap-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void fetchData();
      }}
    >
      <div className="grid gap-2">
        <TextInput
          label="Web URL"
          orientation="vertical"
          type="url"
          required
          value={url}
          placeholder="https://example.com"
          error={error}
          status={loading ? "Fetching data…" : undefined}
          onChange={(event) => {
            activeRequest.current?.abort();
            setUrl(event.currentTarget.value);
            setLoading(false);
            setError(undefined);
            setResult(undefined);
          }}
        />
        <Button
          type="submit"
          size="xs"
          className="justify-self-start"
          disabled={loading || url.trim() === ""}
        >
          Fetch data
        </Button>
      </div>
      {result !== undefined && (
        <pre
          aria-label="Extracted data"
          className="max-h-[65vh] overflow-auto rounded-md border bg-muted p-4 text-xs"
          tabIndex={0}
        >
          {result}
        </pre>
      )}
    </form>
  );
}
