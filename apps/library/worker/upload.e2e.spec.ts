import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("POST /upload and GET /assets/*", () => {
  it("stores an image in R2 and serves it from the returned URL", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const formData = new FormData();
    formData.set(
      "file",
      new File([bytes], "logo.png", {
        type: "image/png",
      }),
    );

    const response = await SELF.fetch("https://library.invalid/upload", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:4100",
      },
      body: formData,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      key: string;
      url: string;
      contentType: string;
    };
    expect(body.contentType).toBe("image/png");
    expect(body.key).toMatch(/^library\/.+\.png$/);
    expect(body.url).toBe(`https://library.invalid/assets/${body.key}`);

    const stored = await env.ASSETS.get(body.key);
    expect(stored).not.toBeNull();
    expect(stored?.httpMetadata?.contentType).toBe("image/png");

    const assetResponse = await SELF.fetch(body.url, {
      method: "GET",
      headers: {
        Origin: "http://127.0.0.1:4100",
      },
    });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("Content-Type")).toBe("image/png");
    const assetBytes = new Uint8Array(await assetResponse.arrayBuffer());
    expect(Array.from(assetBytes)).toEqual(Array.from(bytes));
  });

  it("returns 404 for a missing asset key", async () => {
    const response = await SELF.fetch(
      "https://library.invalid/assets/library/missing.png",
      {
        method: "GET",
      },
    );
    expect(response.status).toBe(404);
  });
});
