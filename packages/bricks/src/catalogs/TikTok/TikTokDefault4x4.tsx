import { useEffect } from "react";

import { BrickFrame } from "../../BrickFrame";

export function TikTokDefault4x4(props: { data: { username: string } }) {
  useEffect(() => {
    document.querySelector('script[data-qrk-tiktok-embed="true"]')?.remove();

    const script = document.createElement("script");
    script.async = true;
    script.dataset.qrkTiktokEmbed = "true";
    script.src = "https://www.tiktok.com/embed.js";
    document.body.appendChild(script);
  }, [props.data.username]);

  return (
    <BrickFrame backgroundClassName="bg-white" textClassName="text-zinc-950">
      <div className="h-full w-full overflow-auto bg-white p-2">
        <blockquote
          cite={`https://www.tiktok.com/@${props.data.username}`}
          className="tiktok-embed m-0 h-full min-w-0 max-w-none"
          data-embed-from="oembed"
          data-embed-type="creator"
          data-unique-id={props.data.username}
        >
          <section>
            <a
              href={`https://www.tiktok.com/@${props.data.username}?refer=creator_embed`}
              rel="noreferrer"
              target="_blank"
            >
              @{props.data.username}
            </a>
          </section>
        </blockquote>
      </div>
    </BrickFrame>
  );
}
