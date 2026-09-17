import { isBreakpointId, resolveBreakpointEntry } from "./breakpoints";

/** Env vars and secrets for the measurement Worker. */
interface Env {
  CLOUDFLARE_ACCOUNT_ID: string;
  PUBLIC_EXAMPLE_ORIGIN: string;
  BROWSER_RENDERING_API_TOKEN?: string;
}

const MEASURE_SELECTOR = "[data-measure-root]";
const READY_SELECTOR = '[data-measure-ready="ok"]';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readFiniteNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

async function measureWithKitesurf(env: Env, breakpoint: string) {
  const entry = resolveBreakpointEntry(breakpoint);
  if (entry === undefined || !isBreakpointId(breakpoint)) {
    return jsonResponse(
      { error: `Invalid breakpoint: ${JSON.stringify(breakpoint)}. Expected sm|md|lg|xl.` },
      400,
    );
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const origin = env.PUBLIC_EXAMPLE_ORIGIN?.trim().replace(/\/+$/, "");
  const token = env.BROWSER_RENDERING_API_TOKEN?.trim();

  if (token === undefined || token.length === 0) {
    return jsonResponse(
      {
        error:
          "Missing BROWSER_RENDERING_API_TOKEN secret. Set it with `wrangler secret put BROWSER_RENDERING_API_TOKEN`.",
      },
      500,
    );
  }
  if (accountId === undefined || accountId.length === 0) {
    return jsonResponse(
      {
        error:
          "Missing CLOUDFLARE_ACCOUNT_ID. Set it in wrangler.jsonc vars before deploying.",
      },
      500,
    );
  }
  if (origin === undefined || origin.length === 0) {
    return jsonResponse(
      {
        error:
          "Missing PUBLIC_EXAMPLE_ORIGIN. Set it in wrangler.jsonc vars to the deployed example origin.",
      },
      500,
    );
  }

  const renderUrl = `${origin}/render?breakpoint=${breakpoint}`;
  const scrapeUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/scrape?browser=kitesurf`;

  let upstream: Response;
  try {
    upstream = await fetch(scrapeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: renderUrl,
        elements: [{ selector: MEASURE_SELECTOR }],
        waitForSelector: {
          selector: READY_SELECTOR,
          timeout: 60_000,
        },
        gotoOptions: {
          waitUntil: "networkidle0",
          timeout: 60_000,
        },
        viewport: {
          width: entry.previewWidth,
          height: 900,
          deviceScaleFactor: 1,
        },
        cacheTTL: 0,
      }),
    });
  } catch (cause) {
    return jsonResponse(
      {
        error: `Failed to reach Browser Rendering scrape API: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      },
      502,
    );
  }

  const upstreamText = await upstream.text();
  let upstreamJson: unknown;
  try {
    upstreamJson = JSON.parse(upstreamText) as unknown;
  } catch {
    return jsonResponse(
      {
        error: `Browser Rendering scrape returned non-JSON (HTTP ${upstream.status}): ${upstreamText.slice(0, 400)}`,
      },
      502,
    );
  }

  if (
    upstreamJson === null ||
    typeof upstreamJson !== "object" ||
    Array.isArray(upstreamJson)
  ) {
    return jsonResponse(
      { error: `Unexpected scrape payload shape (HTTP ${upstream.status}).` },
      502,
    );
  }

  if (!upstream.ok || ("success" in upstreamJson && upstreamJson.success === false)) {
    const errors =
      "errors" in upstreamJson && Array.isArray(upstreamJson.errors)
        ? upstreamJson.errors
        : undefined;
    const messageFromErrors =
      errors !== undefined &&
      errors.length > 0 &&
      errors[0] !== null &&
      typeof errors[0] === "object" &&
      "message" in errors[0] &&
      typeof errors[0].message === "string"
        ? errors[0].message
        : undefined;
    return jsonResponse(
      {
        error:
          messageFromErrors ??
          `Browser Rendering scrape failed with HTTP ${upstream.status}.`,
        details: upstreamJson,
      },
      502,
    );
  }

  const result = "result" in upstreamJson ? upstreamJson.result : undefined;
  if (!Array.isArray(result) || result.length === 0) {
    return jsonResponse(
      { error: "Scrape response contained no result rows for the measure selector." },
      502,
    );
  }

  const firstRow = result[0];
  if (firstRow === null || typeof firstRow !== "object" || Array.isArray(firstRow)) {
    return jsonResponse({ error: "Scrape result row was not an object." }, 502);
  }

  const matches = "results" in firstRow ? firstRow.results : undefined;
  if (!Array.isArray(matches) || matches.length === 0) {
    return jsonResponse(
      {
        error:
          "Scrape found no elements for [data-measure-root]. The render page may have failed readiness or the origin is wrong.",
      },
      502,
    );
  }

  const match = matches[0];
  if (match === null || typeof match !== "object" || Array.isArray(match)) {
    return jsonResponse({ error: "Scrape match entry was not an object." }, 502);
  }

  const width = readFiniteNumber("width" in match ? match.width : undefined);
  const height = readFiniteNumber("height" in match ? match.height : undefined);
  if (width === undefined || height === undefined) {
    return jsonResponse(
      {
        error: "Scrape match was missing finite width/height dimensions.",
        details: match,
      },
      502,
    );
  }

  return jsonResponse({
    breakpoint,
    renderUrl,
    widthPx: Math.round(width),
    heightPx: Math.round(height),
  });
}

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/measure") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "POST required." }, 405);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Request body must be JSON." }, 400);
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Request body must be a JSON object." }, 400);
    }

    const breakpoint =
      "breakpoint" in body && typeof body.breakpoint === "string"
        ? body.breakpoint
        : undefined;
    if (breakpoint === undefined) {
      return jsonResponse({ error: 'Missing string "breakpoint" field.' }, 400);
    }

    return measureWithKitesurf(env, breakpoint);
  },
};
