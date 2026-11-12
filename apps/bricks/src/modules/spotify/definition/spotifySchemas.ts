import { Schema } from "effect";

const spotifyContentPath =
  /^\/(?:intl-[A-Za-z]{2}(?:-[A-Za-z]{2})?\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]{1,128})\/?$/;

/** Normalize supported Spotify share links without using their query or fragment. */
export function normalizeSpotifyUrl(input: string) {
  const url = URL.parse(input.trim());
  if (
    url === null ||
    url.protocol !== "https:" ||
    url.hostname !== "open.spotify.com" ||
    url.username ||
    url.password ||
    url.port
  )
    return undefined;
  const match = spotifyContentPath.exec(url.pathname);
  if (match === null) return undefined;
  return `https://open.spotify.com/${match[1]}/${match[2]}`;
}

export const spotifyUrlSchema = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      normalizeSpotifyUrl(value) === value || "Expected a canonical Spotify content URL",
  ),
);
