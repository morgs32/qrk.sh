import { Schema } from "effect";

const reservedPaths =
  /^(?:about|app|blog|contact|dashboard|discover|explore|faq|help|login|logout|pricing|privacy|settings|signup|terms)$/i;

export function normalizeCoffeeUrl(input: string) {
  const url = URL.parse(input.trim());
  if (
    url === null ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["buymeacoffee.com", "www.buymeacoffee.com"].includes(url.hostname) ||
    !/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
  )
    return undefined;
  const creator = url.pathname.replace(/^\/|\/$/g, "");
  if (reservedPaths.test(creator)) return undefined;
  return `https://buymeacoffee.com/${creator}`;
}

export const buyMeACoffeeUrlSchema = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      normalizeCoffeeUrl(value) === value || "Expected a canonical Buy Me a Coffee creator URL",
  ),
);

export const buyMeACoffeeMessageSchema = Schema.String.check(Schema.isMaxLength(160));
