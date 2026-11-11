import { Schema } from "effect";

const profilePath = /^\/[A-Za-z0-9_-]+\/?$/;
const reservedPaths =
  /^(?:about|account|api|blog|dev|discover|gallery|galleries|hire|joblist|jobs|live|login|misc|search|services|signup|terms)$/i;

export function normalizeBehanceProfile(input: string) {
  const url = URL.parse(input.trim());
  if (
    url === null ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["behance.net", "www.behance.net", "be.net", "www.be.net"].includes(url.hostname) ||
    !profilePath.test(url.pathname)
  )
    return undefined;
  const username = url.pathname.replace(/^\/|\/$/g, "");
  if (reservedPaths.test(username)) return undefined;
  return `https://www.behance.net/${username.toLowerCase()}`;
}

export const behanceProfileUrlSchema = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      normalizeBehanceProfile(value) === value || "Expected a canonical Behance profile URL",
  ),
);

export const behanceCoverUrlSchema = Schema.String.check(
  Schema.makeFilter((value) => {
    const url = URL.parse(value);
    return (
      (url !== null &&
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        url.hostname.endsWith(".behance.net")) ||
      "Expected an HTTPS Behance cover URL"
    );
  }),
);

export const behanceProjectSchema = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^\d+$/)),
  title: Schema.NonEmptyString,
  url: Schema.String.check(
    Schema.isPattern(/^https:\/\/www\.behance\.net\/gallery\/\d+(?:\/[A-Za-z0-9_-]+)?$/),
  ),
  coverUrl: behanceCoverUrlSchema,
}).check(
  Schema.makeFilter(({ id, url }) => url.split("/")[4] === id || "Project link must match its ID"),
);

export const behanceImportSchema = Schema.Struct({
  url: behanceProfileUrlSchema,
  displayName: Schema.NonEmptyString,
  projects: Schema.Array(behanceProjectSchema).check(Schema.isMaxLength(12)),
});
