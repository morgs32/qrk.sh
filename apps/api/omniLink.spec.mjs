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
              return new Response(mock.body, mock);
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
const htmlHeaders = { "Content-Type": "text/html" };

async function lookup(responses) {
  const response = await worker.dispatchFetch("https://api.qrk.localhost/", {
    method: "POST",
    body: JSON.stringify({ url, responses }),
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
  assert.deepEqual(calls, [url, declaredUrl]);
  assert.deepEqual(data.page.openGraph.map(({ content }) => content), ["/first.jpg", "/second.jpg"]);
  assert.deepEqual(data.page.jsonLd, [{ name: "Example" }]);
  assert.deepEqual(data.page.canonicalLinks, ["https://example.com/canonical"]);
  assert.equal(data.page.icons[0].url, "https://example.com/favicon.ico");
  assert.equal(data.embed.discovery, "advertised");
  assert.deepEqual(data.embed.oEmbed, { author_name: "Example", thumbnail_url: "/thumb" });
  assert.deepEqual(data.embed.images, ["https://example.com/thumb"]);
  assert.deepEqual(data.embed.imageFields, [
    { field: "thumbnail_url", url: "https://example.com/thumb" },
  ]);
});

test("finds image URLs in escaped JSON on the appended embed when the page has no data", async () => {
  const escaped = JSON.stringify(JSON.stringify({ items: [{ cover: "https://cdn.example.com/a.jpg" }] }));
  const { data, calls } = await lookup({
    [url]: { headers: htmlHeaders, body: "<html></html>" },
    [embedUrl]: {
      headers: htmlHeaders,
      body: `<script>render({args:[${escaped}]});</script><img src="/b.webp">`,
    },
  });
  assert.deepEqual(calls, [url, embedUrl]);
  assert.equal(data.page.outcome, "empty");
  assert.equal(data.embed.outcome, "ok");
  assert.deepEqual(data.embed.images, ["https://cdn.example.com/a.jpg", "https://example.com/b.webp"]);
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
  assert.deepEqual(calls, [url, declaredUrl]);
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
