import { isIP } from "node:net";
import { Effect, Schema } from "effect";
import { mapValues } from "es-toolkit";
import { imageSize } from "image-size";

import { ScrapeError } from "../ScrapeError";

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));
const imageExtension = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
const oEmbedType = /^(?:application\/json|text\/xml|application\/xml)\+oembed$/i;
const maxResponseBytes = 4 * 1024 * 1024;

function publicUrl(value: string, base?: URL) {
  const url = URL.parse(value.trim(), base);
  if (url === null || !["https:", "http:"].includes(url.protocol)) return undefined;
  const host = url.hostname.replace(/\.$/, "");
  if (
    url.username ||
    url.password ||
    isIP(host.replace(/^\[|\]$/g, "")) ||
    !host.includes(".") ||
    /(?:\.(?:localhost|local|internal|lan|test|invalid)|\.home\.arpa)$/.test(host)
  )
    return undefined;
  url.hash = "";
  return url;
}

async function readSource(
  requestUrl: URL,
  timeoutMs: number,
  discovery?: "advertised" | "appended-pathname",
) {
  const url = requestUrl.href;
  const signal = AbortSignal.timeout(timeoutMs);
  let current = requestUrl;
  let status: number | undefined;
  let advertised: URL | undefined;
  let manifest: URL | undefined;
  let hasEmbedDeclaration = false;
  const openGraph: { property: string; content: string }[] = [];
  const jsonLd: Schema.Json[] = [];
  const icons: { url: string; rel: string; sizes?: string }[] = [];
  const canonicalLinks = new Set<string>();
  const images = new Set<string>();
  const imageFields = new Map<
    string,
    { field: string; url: string; source: string; path: (string | number)[] }
  >();
  let oEmbed: Schema.Json | undefined;

  function result(outcome: "ok" | "empty" | "error", error?: string) {
    return {
      advertised,
      hasEmbedDeclaration,
      manifest,
      source: {
        url,
        finalUrl: current.href === url ? undefined : current.href,
        discovery,
        status,
        outcome,
        error,
        openGraph,
        jsonLd,
        icons,
        canonicalLinks: [...canonicalLinks],
        images: [...images],
        imageFields: [...imageFields.values()],
        oEmbed,
      },
    };
  }

  function discoverEmbed(href: string) {
    hasEmbedDeclaration = true;
    if (href.trim()) advertised ??= publicUrl(href, current);
  }

  function addImage(
    value: string,
    knownImage: boolean,
    field = "",
    source = "html",
    path: (string | number)[] = [field],
  ) {
    if (!value.trim()) return;
    const image = publicUrl(value, current);
    if (!image || (!knownImage && !imageExtension.test(image.pathname))) return;
    images.add(image.href);
    if (field)
      imageFields.set(JSON.stringify([source, path, image.href]), {
        field,
        url: image.href,
        source,
        path,
      });
  }

  function readImageValues(
    value: Schema.Json,
    source: string,
    field = "",
    path: (string | number)[] = [],
    depth = 0,
    isImageObjectUrl = false,
  ) {
    if (depth > 32 || value === null) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"')) {
        const embedded = decodeJson(trimmed);
        if (embedded._tag === "Some")
          readImageValues(embedded.value, source, field, path, depth + 1, isImageObjectUrl);
      } else {
        const knownImage =
          isImageObjectUrl ||
          /^(?:image|imageUrl|thumbnail|thumbnailUrl|thumbnail_url)$/i.test(field);
        if (knownImage || /^(?:https?:\/\/|\/\/|\.{0,2}\/)/i.test(trimmed))
          addImage(trimmed, knownImage, field, source, path);
      }
    } else if (value instanceof Array) {
      for (const [index, item] of value.entries())
        readImageValues(item, source, field, [...path, index], depth + 1, isImageObjectUrl);
    } else if (typeof value === "object") {
      // Sprite metadata also marks standalone UI assets when its value is zero or false.
      if (typeof value.sprited === "number" || typeof value.sprited === "boolean") return;
      const isImageObject = value["@type"] === "ImageObject";
      mapValues(value, (item, key) => {
        const field = String(key);
        readImageValues(
          item,
          source,
          field,
          [...path, field],
          depth + 1,
          isImageObject && /^(?:url|contentUrl)$/.test(field),
        );
      });
    }
  }

  try {
    let response: Response;
    for (let redirects = 0; ; redirects++) {
      response = await fetch(current, {
        redirect: "manual",
        signal,
        headers: {
          Accept: "text/html, application/xhtml+xml, application/json, application/xml, text/xml",
          "User-Agent": "Mozilla/5.0",
        },
      });
      status = response.status;
      if (![301, 302, 303, 307, 308].includes(status)) break;
      await response.body?.cancel();
      const location = response.headers.get("location");
      const target = location ? publicUrl(location, current) : undefined;
      if (!target || redirects >= 4) return result("error", "The redirect could not be followed.");
      current = target;
    }

    const linkHeader = response.headers.get("link") ?? "";
    for (const [, href, parameters] of linkHeader.matchAll(/<([^>]+)>([^<]*)/g)) {
      const rel = parameters.match(/;\s*rel\s*=\s*(?:"([^"]+)"|([^;,\s]+))/i);
      const type = parameters.match(/;\s*type\s*=\s*(?:"([^"]+)"|([^;,\s]+))/i);
      if (
        (rel?.[1] ?? rel?.[2])?.toLowerCase().split(/\s+/).includes("alternate") &&
        oEmbedType.test(type?.[1] ?? type?.[2] ?? "")
      )
        discoverEmbed(href);
    }

    if (!response.ok) {
      await response.body?.cancel();
      return result("error", `Request returned HTTP ${status}.`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const isHtml = contentType === "text/html" || contentType === "application/xhtml+xml";
    const isJson =
      contentType === "application/json" ||
      contentType?.endsWith("+json") ||
      contentType === "application/json+oembed";
    const isXml =
      contentType === "text/xml" ||
      contentType === "application/xml" ||
      contentType === "text/xml+oembed" ||
      contentType === "application/xml+oembed";
    if (contentType?.startsWith("image/")) {
      await response.body?.cancel();
      addImage(current.href, true, "url", "response");
    } else if (!isHtml && !isJson && !isXml) {
      await response.body?.cancel();
      return result("empty");
    } else {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let length = 0;
      let body = "";
      if (reader) {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > maxResponseBytes) {
            await reader.cancel();
            return result("error", "The response is too large to inspect.");
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
      }

      if (isJson) {
        const parsed = decodeJson(body);
        if (parsed._tag === "None") return result("error", "The response contains invalid JSON.");
        oEmbed = parsed.value;
        readImageValues(oEmbed, discovery ? "oembed" : "json");
      } else if (isXml) {
        const fields = new Map<string, string>();
        await new HTMLRewriter()
          .on("oembed > *", {
            element(element) {
              const name = element.tagName;
              fields.set(name, "");
              element.onEndTag(() => {
                const value = fields.get(name) ?? "";
                fields.set(name, value.trim());
              });
            },
          })
          .on("oembed > *", {
            text(chunk) {
              const name = [...fields.keys()].at(-1);
              if (name) fields.set(name, (fields.get(name) ?? "") + chunk.text);
            },
          })
          .transform(new Response(body))
          .text();
        if (fields.size > 0) {
          oEmbed = Object.fromEntries(fields);
          readImageValues(oEmbed, "oembed");
        }
      } else {
        let script = "";
        await new HTMLRewriter()
          .on("meta[property][content]", {
            element(element) {
              const property = element.getAttribute("property") ?? "";
              const content = element.getAttribute("content") ?? "";
              if (/^(?:og|article|book|music|profile|video):/.test(property) && content.trim()) {
                openGraph.push({ property, content });
                if (/^og:image(?::(?:url|secure_url))?$/.test(property))
                  addImage(content, true, property, "opengraph");
              }
            },
          })
          .on("link[rel][href]", {
            element(element) {
              const rel = element.getAttribute("rel") ?? "";
              const relations = rel.toLowerCase().split(/\s+/);
              const href = element.getAttribute("href") ?? "";
              if (!href.trim()) return;
              if (
                relations.includes("alternate") &&
                oEmbedType.test(element.getAttribute("type") ?? "")
              )
                discoverEmbed(href);
              const target = publicUrl(href, current);
              if (!target) return;
              if (relations.includes("manifest")) manifest ??= target;
              if (relations.includes("canonical")) canonicalLinks.add(target.href);
              if (
                relations.some((value) => ["icon", "apple-touch-icon", "mask-icon"].includes(value))
              ) {
                icons.push({
                  url: target.href,
                  rel,
                  sizes: element.getAttribute("sizes") ?? undefined,
                });
                addImage(target.href, true, rel, "icon");
              }
              if (relations.includes("image_src")) addImage(target.href, true, "image_src");
            },
          })
          .on("img, picture source, video[poster]", {
            element(element) {
              for (const name of ["src", "poster", "data-src"]) {
                const value = element.getAttribute(name);
                if (value) addImage(value, true, name);
              }
              const srcset = element.getAttribute("srcset") ?? element.getAttribute("data-srcset");
              for (const candidate of srcset?.split(",") ?? []) {
                const image = candidate.trim().split(/\s+/)[0];
                if (image) addImage(image, true, "srcset");
              }
            },
          })
          .on("script", {
            element(element) {
              script = "";
              const isJsonLd =
                element.getAttribute("type")?.toLowerCase() === "application/ld+json";
              element.onEndTag(() => {
                const parsed = decodeJson(script.trim());
                if (parsed._tag === "Some") {
                  if (isJsonLd) jsonLd.push(parsed.value);
                  if (
                    isJsonLd ||
                    typeof parsed.value !== "string" ||
                    /^\s*[\[{]/.test(parsed.value)
                  )
                    readImageValues(parsed.value, isJsonLd ? "json-ld" : "json");
                } else if (!isJsonLd) {
                  // Inline scripts can pass serialized JSON as quoted strings.
                  for (const match of script.matchAll(/"(?:[^"\\]|\\[\s\S])*"/g)) {
                    if (!/^"\s*[\[{]/.test(match[0])) continue;
                    const embedded = decodeJson(match[0]);
                    if (embedded._tag === "Some") readImageValues(embedded.value, "json");
                  }
                }
              });
            },
            text(chunk) {
              script += chunk.text;
            },
          })
          .transform(new Response(body))
          .text();
      }
    }
    const hasEmbedFields =
      oEmbed !== undefined &&
      oEmbed !== null &&
      typeof oEmbed === "object" &&
      Object.keys(oEmbed).length > 0;
    const hasImages =
      discovery === undefined
        ? images.size > 0
        : [...images].some((url) => !icons.some((icon) => icon.url === url));
    return result(
      openGraph.length || jsonLd.length || canonicalLinks.size || hasImages || hasEmbedFields
        ? "ok"
        : "empty",
    );
  } catch {
    return result(
      "error",
      signal.aborted ? "The request timed out." : "The response could not be read.",
    );
  }
}

export const getOmniLinkData = Effect.fn("getOmniLinkData")(function* (input: string) {
  const decoded = Schema.decodeUnknownOption(Schema.String)(input);
  const url = decoded._tag === "Some" ? publicUrl(decoded.value) : undefined;
  if (!url)
    return yield* new ScrapeError({
      code: "invalid-scrape-request",
      message: "Enter a public HTTP or HTTPS URL.",
      retryable: false,
    });

  const page = yield* Effect.promise(() => readSource(url, 5_000));
  const appended = new URL(url);
  appended.pathname = `${url.pathname.replace(/\/+$/, "")}/embed/`;
  const embedUrl = page.hasEmbedDeclaration ? page.advertised : appended;
  const discovery = page.hasEmbedDeclaration ? "advertised" : "appended-pathname";
  const embed = embedUrl
    ? (yield* Effect.promise(() => readSource(embedUrl, 2_000, discovery))).source
    : { discovery, outcome: "error", error: "The advertised embed URL is not a public web URL." };

  async function readResource(input: URL) {
    const signal = AbortSignal.timeout(2_000);
    let current = input;
    try {
      for (let redirects = 0; ; redirects++) {
        const response = await fetch(current, { redirect: "manual", signal });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get("location");
          const target = location ? publicUrl(location, current) : undefined;
          if (!target || redirects >= 4) return;
          current = target;
          continue;
        }
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          return;
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > maxResponseBytes) {
            await reader.cancel();
            return;
          }
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { url: current.href, bytes };
      }
    } catch {
      return;
    }
  }

  const candidates = page.source.icons.map((icon) => ({
    url: icon.url,
    mask: icon.rel.toLowerCase().split(/\s+/).includes("mask-icon"),
  }));
  const manifestUrl = page.manifest;
  if (manifestUrl) {
    const manifest = yield* Effect.promise(() => readResource(manifestUrl));
    if (manifest) {
      const parsed = decodeJson(new TextDecoder().decode(manifest.bytes));
      if (
        parsed._tag === "Some" &&
        parsed.value !== null &&
        typeof parsed.value === "object" &&
        !Array.isArray(parsed.value) &&
        Array.isArray(parsed.value.icons)
      ) {
        for (const icon of parsed.value.icons) {
          if (!icon || typeof icon !== "object" || Array.isArray(icon)) continue;
          if (typeof icon.src !== "string") continue;
          const target = publicUrl(icon.src, new URL(manifest.url));
          if (target) candidates.push({ url: target.href, mask: false });
        }
      }
    }
  }

  async function inspectIcon(value: string) {
    const candidate = publicUrl(value);
    if (!candidate) return;
    const resource = await readResource(candidate);
    if (!resource) return;
    const text = new TextDecoder().decode(resource.bytes);
    if (
      /^\s*(?:(?:<\?xml\b[^>]*>|<!--[\s\S]*?-->|<!DOCTYPE\s+svg\b(?:[^>\[]|\[[\s\S]*?\])*>)[\s]*)*<svg(?:\s|>)/i.test(text) &&
      /(?:<\/svg\s*>|<svg\b[^>]*\/>)(?:\s*<!--[\s\S]*?-->)*\s*$/i.test(text)
    ) {
      return { type: "svg", url: resource.url, width: null, height: null };
    }
    try {
      const dimensions = imageSize(resource.bytes);
      const largest = (dimensions.images ?? []).reduce(
        (current, size) =>
          size.width * size.height > current.width * current.height ? size : current,
        dimensions,
      );
      if (dimensions.type === "svg" || largest.width <= 0 || largest.height <= 0) return;
      return {
        type: "raster",
        url: resource.url,
        width: largest.width,
        height: largest.height,
      };
    } catch {
      return;
    }
  }

  const uniqueUrls = [...new Set(candidates.map((candidate) => candidate.url))];
  const inspected = new Map<string, Awaited<ReturnType<typeof inspectIcon>>>();
  for (let index = 0; index < uniqueUrls.length; index += 4) {
    const urls = uniqueUrls.slice(index, index + 4);
    const icons = yield* Effect.promise(() => Promise.all(urls.map(inspectIcon)));
    for (const [position, icon] of icons.entries()) {
      const url = urls[position];
      if (url) inspected.set(url, icon);
    }
  }
  let favicon: { type: string; url: string; width: number | null; height: number | null } | null = null;
  let maskIcon: { type: string; url: string; width: number | null; height: number | null } | null = null;
  for (const candidate of candidates) {
    const icon = inspected.get(candidate.url);
    if (!icon) continue;
    const current = candidate.mask ? maskIcon : favicon;
    const area = (icon.width ?? 0) * (icon.height ?? 0);
    const currentArea = (current?.width ?? 0) * (current?.height ?? 0);
    if (!current || (icon.type === "svg" && current.type !== "svg") ||
      (icon.type === current.type && area > currentArea)) {
      if (candidate.mask) maskIcon = icon;
      else favicon = icon;
    }
  }
  if (!favicon) {
    const origin = new URL(page.source.finalUrl ?? page.source.url);
    const fallback = new URL("/favicon.ico", origin);
    favicon = (yield* Effect.promise(() => inspectIcon(fallback.href))) ?? null;
  }

  const siteIcons = new Set([
    ...page.source.icons.map((icon) => icon.url),
    ...("icons" in embed ? embed.icons.map((icon) => icon.url) : []),
    ...candidates.map((candidate) => candidate.url),
  ]);
  if (favicon) siteIcons.add(favicon.url);
  if (maskIcon) siteIcons.add(maskIcon.url);

  const imageGroups = new Map<string, {
    urls: Set<string>;
    sources: Map<string, { source: string; path: string }>;
  }>();
  const imageSources = [
    { source: "page", fields: page.source.imageFields },
    { source: "embed", fields: "imageFields" in embed ? embed.imageFields : [] },
  ];
  for (const imageSource of imageSources) {
    for (const image of imageSource.fields) {
      if (image.source === "icon" || siteIcons.has(image.url)) continue;
      const parsed = publicUrl(image.url);
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
      const group = imageGroups.get(identity) ?? { urls: new Set(), sources: new Map() };
      group.urls.add(image.url);
      const path = image.path.map((part) =>
        typeof part === "number" ? `[${part}]` : part,
      ).join(".").replace(/\.\[/g, "[") || image.field;
      const source = { source: imageSource.source, path };
      group.sources.set(JSON.stringify(source), source);
      imageGroups.set(identity, group);
    }
  }

  const imageUrls = [...new Set([...imageGroups.values()].flatMap((group) => [...group.urls]))];
  const imageDimensions = new Map<string, { width: number; height: number }>();
  for (let index = 0; index < imageUrls.length; index += 4) {
    const urls = imageUrls.slice(index, index + 4);
    const resources = yield* Effect.promise(() =>
      Promise.all(urls.map(async (value) => {
        const candidate = publicUrl(value);
        return candidate ? readResource(candidate) : undefined;
      })),
    );
    for (const [position, resource] of resources.entries()) {
      const imageUrl = urls[position];
      if (!resource || !imageUrl || siteIcons.has(resource.url)) continue;
      try {
        const dimensions = imageSize(resource.bytes);
        const largest = (dimensions.images ?? []).reduce(
          (current, size) =>
            size.width * size.height > current.width * current.height ? size : current,
          dimensions,
        );
        if (largest.width > 0 && largest.height > 0)
          imageDimensions.set(imageUrl, { width: largest.width, height: largest.height });
      } catch {
        // Images that cannot be measured remain available in the raw source data.
      }
    }
  }

  const largeImages: {
    url: string;
    width: number;
    height: number;
    sources: { source: string; path: string }[];
  }[] = [];
  for (const group of imageGroups.values()) {
    let largest: { url: string; width: number; height: number } | undefined;
    for (const imageUrl of group.urls) {
      const dimensions = imageDimensions.get(imageUrl);
      if (!dimensions || dimensions.width <= 600 || dimensions.height <= 600) continue;
      if (!largest || dimensions.width * dimensions.height > largest.width * largest.height)
        largest = { url: imageUrl, ...dimensions };
    }
    if (largest) largeImages.push({ ...largest, sources: [...group.sources.values()] });
  }

  const displayIcons = new Set([
    ...page.source.icons.map((icon) => icon.url),
    ...("icons" in embed ? embed.icons.map((icon) => icon.url) : []),
    ...page.source.imageFields.filter((image) => image.source === "icon").map((image) => image.url),
    ...("imageFields" in embed
      ? embed.imageFields.filter((image) => image.source === "icon").map((image) => image.url)
      : []),
  ]);
  if (favicon) displayIcons.add(favicon.url);
  if (maskIcon) displayIcons.add(maskIcon.url);
  const displayImages = new Set([
    ...page.source.images,
    ...("images" in embed ? embed.images : []),
  ].filter((image) => !displayIcons.has(image)));
  const dataFields = new Map<string, {
    field: string;
    value: string;
    originalType: string;
    derived: boolean;
    sources: { source: string; path: string }[];
  }>();

  function addField(
    key: string,
    value: string | number | boolean,
    source: string,
    path: string,
    derived = false,
  ) {
    const display = String(value).trim();
    if (!display || displayImages.has(display)) return;
    const field = key
      .replace(/^og:|^@/, "")
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/[:_-]/g, " ")
      .replace(/^./, (letter) => letter.toLowerCase());
    const originalType = typeof value;
    const identity = JSON.stringify([field, display, originalType, derived]);
    const existing = dataFields.get(identity);
    if (existing) {
      if (!existing.sources.some((item) => item.source === source && item.path === path))
        existing.sources.push({ source, path });
    } else {
      dataFields.set(identity, {
        field,
        value: display,
        originalType,
        derived,
        sources: [{ source, path }],
      });
    }
  }

  for (const item of [
    { source: "page", data: page.source },
    { source: "embed", data: embed },
  ]) {
    if ("openGraph" in item.data) {
      for (const [index, { property, content }] of item.data.openGraph.entries()) {
        if (/^og:(?:image|video|audio)(?::|$)/i.test(property)) continue;
        const path = `openGraph[${index}].content`;
        addField(property, content, item.source, path);
        if (property.toLowerCase() === "og:description") {
          for (const [, count, label] of content.matchAll(
            /\b(\d[\d,.]*(?:[KMB])?)\s+(followers|following|posts)\b/gi,
          )) {
            if (count && label) addField(label.toLowerCase(), count, item.source, path, true);
          }
        }
      }
    }
    const structured = [
      ...("jsonLd" in item.data
        ? item.data.jsonLd.map((value, index) => ({ value, path: `jsonLd[${index}]` }))
        : []),
      { value: "oEmbed" in item.data ? item.data.oEmbed : undefined, path: "oEmbed" },
    ];
    for (const entry of structured) {
      const records = Array.isArray(entry.value) ? entry.value : [entry.value];
      for (const [index, record] of records.entries()) {
        if (!record || typeof record !== "object" || Array.isArray(record)) continue;
        const recordPath = Array.isArray(entry.value) ? `${entry.path}[${index}]` : entry.path;
        mapValues(record, (value, key) => {
          if (key === "html" || key === "@context") return;
          if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
            return;
          const property = String(key);
          const path = /^[A-Za-z_$][\w$]*$/.test(property)
            ? `${recordPath}.${property}`
            : `${recordPath}[${JSON.stringify(property)}]`;
          addField(property, value, item.source, path);
        });
      }
    }
  }

  return JSON.stringify({ page: page.source, embed, favicon, maskIcon, largeImages, data: [...dataFields.values()] }, null, 2);
});
