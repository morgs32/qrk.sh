import { StateProvider } from "@json-render/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImageCarousel } from "../../imageCarousel/react/ImageCarousel";
import { SpotifyPlayer } from "../../spotify/react/SpotifyPlayer";
import { YoutubePlayer } from "./YoutubePlayer";

describe("published player server rendering", () => {
  it("does not load YouTube before the Wall is visible", () => {
    const html = renderToStaticMarkup(createElement(
      StateProvider,
      { initialState: { brickState: { content: { kind: "video", videoId: "abcdefghijk", playlistId: null, startSeconds: 0 } } } },
      createElement(YoutubePlayer),
    ));
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("youtube-nocookie.com");
  });

  it("does not load Spotify before the Wall is visible", () => {
    const html = renderToStaticMarkup(createElement(
      StateProvider,
      { initialState: { brickState: { url: "https://open.spotify.com/track/0123456789" } } },
      createElement(SpotifyPlayer),
    ));
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("open.spotify.com");
  });

  it("keeps carousel images in server HTML before initialization", () => {
    const html = renderToStaticMarkup(createElement(
      StateProvider,
      { initialState: { brickState: { slides: [{ id: "one", imageUrl: "https://example.test/one.png", alt: "A mountain", crop: null }], interval: 5 } } },
      createElement(ImageCarousel),
    ));
    expect(html).toContain('alt="A mountain"');
    expect(html).toContain("https://example.test/one.png");
  });
});
