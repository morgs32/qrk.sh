import { Schema } from "effect";

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const playlistIdPattern = /^[A-Za-z0-9_-]{2,128}$/;

export const youtubeContentSchema = Schema.Struct({
  kind: Schema.Literals(["video", "playlist"]),
  videoId: Schema.NullOr(Schema.String.check(Schema.isPattern(videoIdPattern))),
  playlistId: Schema.NullOr(Schema.String.check(Schema.isPattern(playlistIdPattern))),
  startSeconds: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}).check(
  Schema.makeFilter((content) =>
    content.kind === "video"
      ? content.videoId !== null || "A video ID is required"
      : content.playlistId !== null || "A playlist ID is required",
  ),
);

/** Parse supported YouTube links without loading the provider. */
export function parseYoutubeUrl(input: string) {
  const url = URL.parse(input.trim());
  if (
    url === null || url.protocol !== "https:" || url.username || url.password || url.port ||
    !["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(url.hostname)
  ) return undefined;

  let videoId: string | null = null;
  if (url.hostname === "youtu.be") {
    videoId = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    if (videoId === null) return undefined;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
    if (videoId === null || !videoIdPattern.test(videoId)) return undefined;
  } else if (["/playlist", "/embed", "/embed/", "/embed/videoseries"].includes(url.pathname)) {
    videoId = null;
  } else {
    videoId = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    if (videoId === null) return undefined;
  }

  const playlistId = url.searchParams.get("list");
  if ((playlistId !== null && !playlistIdPattern.test(playlistId)) || (videoId === null && playlistId === null)) return undefined;
  const time = url.searchParams.get("t") ?? url.searchParams.get("start");
  let startSeconds = 0;
  if (time !== null) {
    if (/^\d+$/.test(time)) startSeconds = Number(time);
    else {
      const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);
      if (match === null || !match[0]) return undefined;
      startSeconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    }
    if (!Number.isSafeInteger(startSeconds)) return undefined;
  }
  return { videoId, playlistId, startSeconds };
}

/** Construct only YouTube's documented iframe URLs from validated content. */
export function youtubeEmbedUrl(content: typeof youtubeContentSchema.Type) {
  const url = new URL(content.videoId === null
    ? "https://www.youtube-nocookie.com/embed"
    : `https://www.youtube-nocookie.com/embed/${content.videoId}`);
  if (content.kind === "playlist" && content.playlistId !== null) {
    url.searchParams.set("listType", "playlist");
    url.searchParams.set("list", content.playlistId);
  }
  if (content.startSeconds > 0) url.searchParams.set("start", String(content.startSeconds));
  return url.href;
}
