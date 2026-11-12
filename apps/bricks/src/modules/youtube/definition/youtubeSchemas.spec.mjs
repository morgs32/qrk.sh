import { Schema } from "effect";
import { parseYoutubeUrl, youtubeContentSchema, youtubeEmbedUrl } from "./youtubeSchemas";

it("accepts share, watch, Shorts, embed and playlist links with start times", () => {
  for (const input of [
    "https://youtu.be/M7lc1UVf-VE?t=1m30s",
    "https://www.youtube.com/watch?v=M7lc1UVf-VE&t=90",
    "https://www.youtube.com/shorts/M7lc1UVf-VE?start=90",
    "https://www.youtube.com/embed/M7lc1UVf-VE?t=90",
  ]) {
    expect(parseYoutubeUrl(input)).toEqual({ videoId: "M7lc1UVf-VE", playlistId: null, startSeconds: 90 });
  }
  expect(parseYoutubeUrl("https://www.youtube.com/playlist?list=PLabc123")).toEqual({ videoId: null, playlistId: "PLabc123", startSeconds: 0 });
});

it("retains a linked playlist and builds a privacy-enhanced player for either choice", () => {
  const content = parseYoutubeUrl("https://youtube.com/watch?v=M7lc1UVf-VE&list=PLabc123&t=42");
  expect(content).toEqual({ videoId: "M7lc1UVf-VE", playlistId: "PLabc123", startSeconds: 42 });
  expect(youtubeEmbedUrl({ ...content, kind: "video" })).toBe("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=42");
  const restored = Schema.decodeUnknownSync(youtubeContentSchema)(JSON.parse(JSON.stringify({ ...content, kind: "playlist" })));
  expect(restored).toEqual({ kind: "playlist", videoId: "M7lc1UVf-VE", playlistId: "PLabc123", startSeconds: 42 });
  expect(youtubeEmbedUrl(restored)).toBe("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?listType=playlist&list=PLabc123&start=42");
  expect(youtubeEmbedUrl({ videoId: null, playlistId: "PLabc123", startSeconds: 0, kind: "playlist" })).toBe("https://www.youtube-nocookie.com/embed?listType=playlist&list=PLabc123");
});

it("rejects unsupported hosts, malformed identifiers and invalid start times", () => {
  for (const input of [
    "http://youtube.com/watch?v=M7lc1UVf-VE",
    "https://youtube.com.evil.test/watch?v=M7lc1UVf-VE",
    "https://user@youtube.com/watch?v=M7lc1UVf-VE",
    "https://youtube.com/watch?v=bad",
    "https://youtube.com/watch?v=M7lc1UVf-VE&t=wat",
    "https://youtube.com/playlist?list=bad!",
  ]) expect(parseYoutubeUrl(input)).toBeUndefined();
});
