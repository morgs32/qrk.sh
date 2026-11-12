import { Button } from "@qrk.sh/bricks/components/button";
import type { BricksApi } from "@qrk.sh/bricks/rpc";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

import { TextInput } from "../../../components/TextInput";

const sourceSchema = Schema.Struct({
  openGraph: Schema.optionalKey(
    Schema.Array(Schema.Struct({ property: Schema.String, content: Schema.String })),
  ),
  jsonLd: Schema.optionalKey(Schema.Array(Schema.Json)),
  oEmbed: Schema.optionalKey(Schema.Json),
  images: Schema.optionalKey(Schema.Array(Schema.String)),
  icons: Schema.optionalKey(Schema.Array(Schema.Struct({ url: Schema.String }))),
  imageFields: Schema.optionalKey(Schema.Array(Schema.Struct({
    field: Schema.String,
    url: Schema.String,
    source: Schema.String,
    path: Schema.Array(Schema.Union([Schema.String, Schema.Number])),
  }))),
  error: Schema.optionalKey(Schema.String),
});
const iconSchema = Schema.NullOr(Schema.Struct({
  type: Schema.Literals(["svg", "raster"]),
  url: Schema.String,
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
}));
const largeImageSchema = Schema.Struct({
  url: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  sources: Schema.Array(Schema.Struct({
    source: Schema.Literals(["page", "embed"]),
    path: Schema.String,
  })),
});
const dataFieldSchema = Schema.Struct({
  field: Schema.String,
  value: Schema.String,
  originalType: Schema.Literals(["string", "number", "boolean"]),
  derived: Schema.Boolean,
  sources: Schema.Array(Schema.Struct({
    source: Schema.Literals(["page", "embed"]),
    path: Schema.String,
  })),
});
const decodeLookup = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({
    page: sourceSchema,
    embed: sourceSchema,
    favicon: iconSchema,
    maskIcon: iconSchema,
    largeImages: Schema.Array(largeImageSchema),
    data: Schema.Array(dataFieldSchema),
  })),
);
const decodeRawLookup = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({
    page: Schema.Json,
    embed: Schema.Json,
    favicon: Schema.Json,
    maskIcon: Schema.Json,
    largeImages: Schema.Json,
    data: Schema.Json,
  })),
);

function readPreview(lookup: {
  page: typeof sourceSchema.Type;
  embed: typeof sourceSchema.Type;
  favicon: typeof iconSchema.Type;
  maskIcon: typeof iconSchema.Type;
  largeImages: readonly (typeof largeImageSchema.Type)[];
  data: readonly (typeof dataFieldSchema.Type)[];
}) {
  const sources = [lookup.page, lookup.embed];
  const siteIcons = new Set(sources.flatMap((source) => [
    ...(source.icons ?? []).map((icon) => icon.url),
    ...(source.imageFields ?? []).filter((image) => image.source === "icon").map((image) => image.url),
  ]));
  if (lookup.favicon) siteIcons.add(lookup.favicon.url);
  if (lookup.maskIcon) siteIcons.add(lookup.maskIcon.url);
  const images = new Set(
    sources.flatMap((source) => source.images ?? []).filter((url) => !siteIcons.has(url)),
  );
  return {
    fields: lookup.data,
    favicon: lookup.favicon,
    maskIcon: lookup.maskIcon,
    largeImages: lookup.largeImages,
    siteIcons,
    sources: [
      { label: "Page", ...lookup.page },
      { label: "Embed", ...lookup.embed },
    ],
    images: [...images],
    errors: sources.flatMap((source) => (source.error ? [source.error] : [])),
  };
}

export function OmniLinkForm() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ReturnType<typeof readPreview>>();
  const [rawResult, setRawResult] = useState<{
    page: Schema.Json;
    embed: Schema.Json;
    favicon: Schema.Json;
    maskIcon: Schema.Json;
    largeImages: Schema.Json;
    data: Schema.Json;
  }>();
  const [dimensions, setDimensions] = useState<Map<string, { width: number; height: number } | null>>(new Map());
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const activeRequest = useRef<AbortController>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  useEffect(() => {
    setDimensions(new Map());
    if (!result) return;
    let active = true;
    const pending = result.images.map((url) => {
      const image = new Image();
      image.referrerPolicy = "no-referrer";
      image.onload = () => {
        if (active) setDimensions((previous) => new Map(previous).set(url, {
          width: image.naturalWidth,
          height: image.naturalHeight,
        }));
      };
      image.onerror = () => {
        if (active) setDimensions((previous) => new Map(previous).set(url, null));
      };
      image.src = url;
      return image;
    });
    return () => {
      active = false;
      for (const image of pending) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [result]);

  async function fetchData() {
    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setLoading(true);
    setError(undefined);
    setResult(undefined);
    setRawResult(undefined);
    try {
      using api = newSyncRpcSession<BricksApi>("/rpc");
      const close = () => api[Symbol.dispose]();
      request.signal.addEventListener("abort", close, { once: true });
      try {
        const response = await api.getOmniLinkData(url.trim());
        if (request.signal.aborted) return;
        if (response._tag === "Left") {
          setError(response.left.message);
        } else {
          const decoded = decodeLookup(response.right);
          const raw = decodeRawLookup(response.right);
          if (decoded._tag === "Some" && raw._tag === "Some") {
            setRawResult(raw.value);
            setResult(readPreview(decoded.value));
          }
          else setError("Could not read the lookup result.");
        }
      } finally {
        request.signal.removeEventListener("abort", close);
      }
    } catch {
      if (!request.signal.aborted) setError("Could not reach the lookup service. Try again.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  const imageKeys = new Map<string, string>();
  const gallery = new Map<string, {
    url: string;
    size: number;
    group: string;
    source: string;
    paths: Set<string>;
  }>();

  for (const source of result?.sources ?? []) {
    for (const image of source.imageFields ?? []) {
      if (result?.siteIcons.has(image.url)) continue;
      const fullPath = image.path.map((part) =>
        typeof part === "number" ? `[${part}]` : part
      ).join(".").replace(/\.\[/g, "[");
      const groupPath = image.path.map((part) =>
        typeof part === "number" ? "[]" : part
      ).join(".").replace(/\.\[\]/g, "[]");
      const parsed = URL.parse(image.url);
      if (!parsed) continue;
      for (const [key, value] of [...parsed.searchParams]) {
        if (
          (/^(?:w|width|h|height)$/i.test(key) && /^\d{1,5}$/.test(value)) ||
          /^\d{2,5}x\d{2,5}$/i.test(value) ||
          /(?:^|[^a-z\d])[a-z]\d{2,5}x\d{2,5}(?=$|[^a-z\d])/i.test(value)
        ) {
          parsed.searchParams.delete(key, value);
        }
      }
      const filename = parsed.pathname.split("/").at(-1) ?? "";
      const assetId = /(?:^|[._-])(?:\d{15,}|[a-f\d]{24,})(?=[._-]|$)/i.test(filename);
      parsed.searchParams.sort();
      const identity = assetId ? parsed.pathname : parsed.href;
      imageKeys.set(image.url, identity);
      const dimensionsForImage = dimensions.get(image.url);
      const area = dimensionsForImage ? dimensionsForImage.width * dimensionsForImage.height : 0;
      const group = `${image.source} · ${groupPath || image.field}`;
      const path = `${source.label} · ${image.source} · ${fullPath || image.field}`;
      const current = gallery.get(identity);
      if (current) {
        current.paths.add(path);
        if (area > current.size) {
          current.url = image.url;
          current.size = area;
        }
      } else {
        gallery.set(identity, {
          url: image.url,
          size: area,
          source: source.label,
          group,
          paths: new Set([path]),
        });
      }
    }
  }

  return (
    <form
      className="mx-auto grid w-full max-w-3xl gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void fetchData();
      }}
    >
      <TextInput
        label="Web URL"
        orientation="vertical"
        type="url"
        required
        value={url}
        placeholder="https://example.com"
        description={loading || error ? undefined : "Enter a public web URL."}
        error={error}
        status={loading ? "Fetching data…" : undefined}
        onChange={(event) => {
          activeRequest.current?.abort();
          setUrl(event.currentTarget.value);
          setLoading(false);
          setError(undefined);
          setResult(undefined);
          setRawResult(undefined);
        }}
      />
      <Button
        type="submit"
        size="sm"
        className="justify-self-start"
        disabled={loading || url.trim() === ""}
      >
        Fetch data
      </Button>
      {result !== undefined && (
        <div className="mt-2 grid min-w-0 gap-4" aria-live="polite">
          {rawResult && (
            <details open>
              <summary className="cursor-pointer text-sm font-semibold">JSON</summary>
              <div className="max-h-[65vh] overflow-auto rounded-md border bg-muted p-4 text-xs">
                <JsonView
                  data={rawResult}
                  shouldExpandNode={collapseAllNested}
                  style={defaultStyles}
                />
              </div>
            </details>
          )}
          <section className="grid gap-2">
            <h2 className="text-sm font-semibold">Data fields</h2>
            {result.fields.length > 0 ? (
              <dl className="grid gap-1 text-sm">
                {result.fields.map(({ field, value, originalType, derived }) => (
                  <div key={JSON.stringify([field, value, originalType, derived])} className="wrap-anywhere">
                    <dt className="inline font-medium">{field.replace(/^./, (letter) => letter.toUpperCase())}: </dt>
                    <dd className="inline">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No data fields found.</p>
            )}
          </section>
          <section className="grid gap-2">
            <h2 className="text-sm font-semibold">Favicon</h2>
            {result.favicon ? (
              <div className="grid w-24 gap-1">
                <img
                  src={result.favicon.url}
                  alt="Favicon"
                  referrerPolicy="no-referrer"
                  className="aspect-square w-full rounded-md bg-muted object-contain"
                />
                <p className="text-xs text-muted-foreground">
                  {result.favicon.type === "svg"
                    ? "SVG"
                    : `${result.favicon.width} × ${result.favicon.height}`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No favicon found.</p>
            )}
          </section>
          {result.maskIcon && (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold">Mask icon</h2>
              <div className="grid w-24 gap-1">
                <img
                  src={result.maskIcon.url}
                  alt="Mask icon"
                  referrerPolicy="no-referrer"
                  className="aspect-square w-full rounded-md bg-muted object-contain"
                />
                <p className="text-xs text-muted-foreground">
                  {result.maskIcon.type === "svg"
                    ? "SVG"
                    : `${result.maskIcon.width} × ${result.maskIcon.height}`}
                </p>
              </div>
            </section>
          )}
          {result.sources.map((source) => {
            const groups = new Map<string, Array<{
              url: string;
              paths: Set<string>;
              measured?: { width: number; height: number };
              category?: string;
            }>>();
            const largeImageKeys = new Set(
              result.largeImages.map((image) => imageKeys.get(image.url)).filter((key) => key !== undefined),
            );
            for (const image of result.largeImages) {
              const first = image.sources[0];
              if (!first || first.source !== source.label.toLowerCase()) continue;
              const field = source.imageFields?.find((entry) =>
                (entry.path.map((part) => typeof part === "number" ? `[${part}]` : part)
                  .join(".").replace(/\.\[/g, "[") || entry.field) === first.path,
              );
              const groupPath = first.path.replace(/\[\d+\]/g, "[]");
              const group = field ? `${field.source} · ${groupPath}` : groupPath;
              const paths = new Set<string>();
              for (const entry of image.sources) {
                const origin = result.sources.find((item) => item.label.toLowerCase() === entry.source);
                const fields = origin?.imageFields?.filter((item) =>
                  (item.path.map((part) => typeof part === "number" ? `[${part}]` : part)
                    .join(".").replace(/\.\[/g, "[") || item.field) === entry.path,
                ) ?? [];
                if (fields.length === 0) paths.add(`${entry.source} · ${entry.path}`);
                for (const item of fields) {
                  paths.add(`${entry.source} · ${item.source} · ${entry.path}`);
                }
              }
              const images = groups.get(group) ?? [];
              images.push({ url: image.url, paths, measured: image, category: "largeImages" });
              groups.set(group, images);
            }
            for (const [identity, image] of gallery) {
              if (image.source !== source.label || largeImageKeys.has(identity)) continue;
              const images = groups.get(image.group) ?? [];
              images.push(image);
              groups.set(image.group, images);
            }

            return (
              <section key={source.label} className="grid gap-3">
                <h2 className="text-sm font-semibold">{source.label} images</h2>
                {[...groups].map(([group, images]) => (
                  <div key={group} className="grid gap-2">
                    <h3 className="break-all text-sm font-medium">{group}</h3>
                    {["largeImages", "browserOnly", "otherImages", "unknownSize"].map((category) => {
                      const matching = images.filter((image) => {
                        if (image.category) return category === image.category;
                        const size = dimensions.get(image.url);
                        if (!size) return category === "unknownSize";
                        if (size.width < 600 || size.height < 600) return false;
                        if (size.width > 600 && size.height > 600) return category === "browserOnly";
                        return category === "otherImages" && (size.width === 600 || size.height === 600);
                      });
                      if (!matching.length) return null;
                      return (
                        <div key={category} className="grid gap-1">
                          <h4 className="text-xs text-muted-foreground">
                            {category === "browserOnly" ? "Only measured by browser" : category}
                          </h4>
                          <ul className="grid grid-cols-[repeat(auto-fill,96px)] gap-2">
                            {matching.map(({ url, paths, measured: workerSize }) => {
                              const size = workerSize ?? dimensions.get(url);
                              return (
                                <li key={url} className="min-w-0">
                                  <img src={url} alt={[...paths][0]} referrerPolicy="no-referrer"
                                    className="aspect-square w-full rounded-md bg-muted object-contain" />
                                  <p className="break-all text-xs text-muted-foreground">
                                    {size ? `${size.width} × ${size.height}` : "Size unknown"}
                                  </p>
                                  <details className="text-xs">
                                    <summary className="cursor-pointer">Sources ({paths.size})</summary>
                                    <ul className="break-all text-muted-foreground">
                                      {[...paths].map((path) => <li key={path}>{path}</li>)}
                                    </ul>
                                  </details>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {groups.size === 0 && <p className="text-sm text-muted-foreground">No additional images.</p>}
              </section>
            );
          })}
          {result.fields.length === 0 && result.images.length === 0 && result.errors.length > 0 && (
            <p className="text-sm text-muted-foreground">{result.errors.join(" ")}</p>
          )}
        </div>
      )}
    </form>
  );
}
