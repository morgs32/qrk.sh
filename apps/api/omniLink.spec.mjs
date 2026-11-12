import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler"));
const { build } = wranglerRequire("esbuild");
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire("miniflare");

let worker;
before(async () => {
  const bundle = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
      contents: `
        import { Effect } from "effect";
        import { getOmniLinkData } from "../bricks/worker/omniLink/getOmniLinkData";

        export default {
          async fetch(request) {
            const { url, responses } = await request.json();
            const calls = [];
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async (url) => {
              calls.push(String(url));
              const mock = responses[String(url)];
              if (!mock) throw new Error("Unexpected outbound request");
              const body = mock.bodyBase64
                ? Uint8Array.from(atob(mock.bodyBase64), (character) => character.charCodeAt(0))
                : mock.body;
              return new Response(body, mock);
            };
            try {
              const json = await Effect.runPromise(getOmniLinkData(url));
              return Response.json({ data: JSON.parse(json), calls });
            } finally {
              globalThis.fetch = originalFetch;
            }
          },
        };
      `,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-05-14",
      compatibilityFlags: ["nodejs_compat"],
    }),
  );
});
after(async () => worker?.dispose());

const url = "https://example.com/profile";
const embedUrl = `${url}/embed/`;
const fallbackIcon = "https://example.com/favicon.ico";
const htmlHeaders = { "Content-Type": "text/html" };

async function lookup(responses) {
  const response = await worker.dispatchFetch("https://api.qrk.localhost/", {
    method: "POST",
    body: JSON.stringify({ url, responses: { [fallbackIcon]: { status: 404 }, ...responses } }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

test("uses the advertised endpoint and preserves repeated metadata and structured oEmbed fields", async () => {
  const declaredUrl = "https://example.com/oembed?profile=1";
  const { data, calls } = await lookup({
    [url]: {
      headers: {
        ...htmlHeaders,
        Link: '</oembed?profile=1>; rel="alternate"; type="application/json+oembed"',
      },
      body: `
        <meta property="og:image" content="/first.jpg">
        <meta property="og:image" content="/second.jpg">
        <link rel="canonical" href="/canonical">
        <link rel="icon" href="/favicon.ico">
        <script type="application/ld+json">{"name":"Example"}</script>
      `,
    },
    [declaredUrl]: {
      headers: { "Content-Type": "application/json+oembed" },
      body: JSON.stringify({ author_name: "Example", thumbnail_url: "/thumb" }),
    },
  });
  assert.deepEqual(calls.filter((call) => call !== fallbackIcon), [url, declaredUrl]);
  assert.deepEqual(
    data.page.openGraph.map(({ content }) => content),
    ["/first.jpg", "/second.jpg"],
  );
  assert.deepEqual(data.page.jsonLd, [{ name: "Example" }]);
  assert.deepEqual(data.page.canonicalLinks, ["https://example.com/canonical"]);
  assert.equal(data.page.icons[0].url, "https://example.com/favicon.ico");
  assert.equal(data.embed.discovery, "advertised");
  assert.deepEqual(data.embed.oEmbed, { author_name: "Example", thumbnail_url: "/thumb" });
  assert.deepEqual(data.embed.images, ["https://example.com/thumb"]);
  assert.deepEqual(data.embed.imageFields, [
    {
      field: "thumbnail_url",
      url: "https://example.com/thumb",
      source: "oembed",
      path: ["thumbnail_url"],
    },
  ]);
});

test("finds content images in escaped JSON while skipping UI asset records and bare script URLs", async () => {
  const escaped = JSON.stringify(
    JSON.stringify({
      assets: [
        { sprited: 2, src: "https://cdn.example.com/sheet.webp", position: "0 -32px" },
        { sprited: 0, uri: "https://cdn.example.com/icon.gif", width: 16, height: 16 },
      ],
      profile: { avatar: "https://cdn.example.com/avatar.jpg" },
      items: [
        { cover: "https://cdn.example.com/a.jpg" },
        { cover: "https://cdn.example.com/a.jpg" },
      ],
    }),
  );
  const { data, calls } = await lookup({
    [url]: { headers: htmlHeaders, body: "<html></html>" },
    [embedUrl]: {
      headers: htmlHeaders,
      body: `
        <script>render({args:[${escaped},"https://cdn.example.com/bare.gif"]});</script>
        <script>"https://cdn.example.com/standalone.webp"</script>
        <img src="/b.webp">
      `,
    },
  });
  assert.deepEqual(calls.filter((call) => call !== fallbackIcon), [url, embedUrl]);
  assert.equal(data.page.outcome, "empty");
  assert.equal(data.embed.outcome, "ok");
  assert.deepEqual(data.embed.images, [
    "https://cdn.example.com/avatar.jpg",
    "https://cdn.example.com/a.jpg",
    "https://example.com/b.webp",
  ]);
  assert.deepEqual(data.embed.imageFields.map(({ field }) => field), ["avatar", "cover", "cover", "src"]);
  assert.deepEqual(data.embed.imageFields.map(({ source, path }) => ({ source, path })), [
    { source: "json", path: ["profile", "avatar"] },
    { source: "json", path: ["items", 0, "cover"] },
    { source: "json", path: ["items", 1, "cover"] },
    { source: "html", path: ["src"] },
  ]);
});

test("keeps page results when a declared embed redirects to a private URL", async () => {
  const declaredUrl = "https://example.com/oembed";
  const { data, calls } = await lookup({
    [url]: {
      headers: htmlHeaders,
      body: `
        <meta property="og:title" content="Example">
        <link rel="alternate" type="application/json+oembed" href="/oembed">
      `,
    },
    [declaredUrl]: { status: 302, headers: { Location: "http://127.0.0.1/secret" } },
  });
  assert.deepEqual(calls.filter((call) => call !== fallbackIcon), [url, declaredUrl]);
  assert.equal(data.page.outcome, "ok");
  assert.equal(data.embed.outcome, "error");
});

test("preserves XML oEmbed fields from an HTML discovery link", async () => {
  const declaredUrl = "https://example.com/oembed.xml";
  const { data } = await lookup({
    [url]: {
      headers: htmlHeaders,
      body: '<link rel="alternate" type="text/xml+oembed" href="/oembed.xml">',
    },
    [declaredUrl]: {
      headers: { "Content-Type": "text/xml+oembed" },
      body: "<oembed><title>Example</title><thumbnail_url>/cover.jpg</thumbnail_url></oembed>",
    },
  });
  assert.equal(data.embed.outcome, "ok");
  assert.deepEqual(data.embed.oEmbed, { title: "Example", thumbnail_url: "/cover.jpg" });
  assert.deepEqual(data.embed.images, ["https://example.com/cover.jpg"]);
});

test("reports a favicon-only embed response as empty", async () => {
  const { data } = await lookup({
    [url]: { headers: htmlHeaders, body: '<meta property="og:title" content="Example">' },
    [embedUrl]: { headers: htmlHeaders, body: '<link rel="icon" href="/favicon.ico">' },
  });
  assert.equal(data.page.outcome, "ok");
  assert.equal(data.embed.outcome, "empty");
  assert.equal(data.embed.icons[0].url, "https://example.com/favicon.ico");
});

function png(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return { headers: { "Content-Type": "image/png" }, bodyBase64: bytes.toString("base64") };
}

test("prefers a verified SVG and selects mask icons independently from manifest and page images", async () => {
  const { data, calls } = await lookup({
    [url]: {
      headers: htmlHeaders,
      body: `
        <link rel="icon" href="/icon.png">
        <link rel="icon" href="/vector.svg">
        <link rel="mask-icon" href="/mask.svg">
        <link rel="manifest" href="/app/site.webmanifest">
      `,
    },
    [embedUrl]: { status: 404 },
    "https://example.com/app/site.webmanifest": {
      headers: { "Content-Type": "application/manifest+json" },
      body: JSON.stringify({ icons: [{ src: "large.png", sizes: "1024x1024", type: "image/png" }] }),
    },
    "https://example.com/icon.png": png(180, 180),
    "https://example.com/app/large.png": png(1024, 1024),
    "https://example.com/vector.svg": {
      headers: { "Content-Type": "image/svg+xml" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>',
    },
    "https://example.com/mask.svg": {
      headers: { "Content-Type": "image/svg+xml" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
    },
  });
  assert.deepEqual(data.favicon, {
    type: "svg", url: "https://example.com/vector.svg", width: null, height: null,
  });
  assert.deepEqual(data.maskIcon, {
    type: "svg", url: "https://example.com/mask.svg", width: null, height: null,
  });
  assert.ok(calls.includes("https://example.com/app/large.png"));
  assert.ok(!calls.includes(fallbackIcon));
});

test("chooses the largest measured raster regardless of advertised size and uses declaration order for ties", async () => {
  const { data } = await lookup({
    [url]: {
      headers: htmlHeaders,
      body: `
        <link rel="icon" sizes="999x999" href="/small.png">
        <link rel="apple-touch-icon" href="/first.png">
        <link rel="icon" href="/second.png">
      `,
    },
    [embedUrl]: { status: 404 },
    "https://example.com/small.png": png(32, 32),
    "https://example.com/first.png": png(192, 192),
    "https://example.com/second.png": png(192, 192),
  });
  assert.deepEqual(data.favicon, {
    type: "raster", url: "https://example.com/first.png", width: 192, height: 192,
  });
  assert.equal(data.maskIcon, null);
});

test("reads the largest image in a multi-size ICO fallback", async () => {
  const ico = Buffer.alloc(38);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(2, 4);
  ico[6] = 16;
  ico[7] = 16;
  ico[22] = 0;
  ico[23] = 0;
  const { data, calls } = await lookup({
    [url]: { headers: htmlHeaders, body: '<meta property="og:title" content="Example">' },
    [embedUrl]: { status: 404 },
    [fallbackIcon]: { headers: { "Content-Type": "image/x-icon" }, bodyBase64: ico.toString("base64") },
  });
  assert.ok(calls.includes(fallbackIcon));
  assert.deepEqual(data.favicon, {
    type: "raster", url: fallbackIcon, width: 256, height: 256,
  });
});

test("skips private manifest and icon redirects and preserves page data when icons fail", async () => {
  const { data, calls } = await lookup({
    [url]: {
      headers: htmlHeaders,
      body: `
        <meta property="og:title" content="Example">
        <link rel="manifest" href="/manifest.json">
        <link rel="icon" href="/unsafe.png">
        <link rel="apple-touch-icon" href="/missing.png">
      `,
    },
    [embedUrl]: { status: 404 },
    "https://example.com/manifest.json": { status: 302, headers: { Location: "http://127.0.0.1/manifest" } },
    "https://example.com/unsafe.png": { status: 302, headers: { Location: "http://127.0.0.1/private.png" } },
    "https://example.com/missing.png": { status: 404 },
  });
  assert.equal(data.page.outcome, "ok");
  assert.equal(data.favicon, null);
  assert.equal(data.maskIcon, null);
  assert.ok(!calls.some((call) => call.startsWith("http://127.0.0.1")));
  assert.ok(calls.includes(fallbackIcon));
});

test("resolves manifest icons against the final manifest URL and rejects an invalid SVG", async () => {
  const manifestUrl = "https://example.com/app/manifest.json";
  const finalManifestUrl = "https://assets.example.com/icons/manifest.json";
  const manifestIconUrl = "https://assets.example.com/icons/cover.png";
  const { data } = await lookup({
    [url]: {
      headers: htmlHeaders,
      body: '<link rel="icon" href="/invalid.svg"><link rel="manifest" href="/app/manifest.json">',
    },
    [embedUrl]: { status: 404 },
    "https://example.com/invalid.svg": {
      headers: { "Content-Type": "image/svg+xml" },
      body: "this is not an SVG",
    },
    [manifestUrl]: { status: 302, headers: { Location: finalManifestUrl } },
    [finalManifestUrl]: {
      headers: { "Content-Type": "application/manifest+json" },
      body: JSON.stringify({ icons: [{ src: "cover.png" }] }),
    },
    [manifestIconUrl]: png(512, 512),
  });
  assert.deepEqual(data.favicon, {
    type: "raster", url: manifestIconUrl, width: 512, height: 512,
  });
});
