# Spotify Brick research

Researched 2026-11-12 against Spotify's first-party documentation and QRK's current source. The agreed first version is a creator-selected Spotify player; account-connected listening activity is deferred.

## Player and sizing

Spotify embeds support tracks, albums, playlists, artists, shows, and episodes. Spotify recommends an audio embed width of at least 280px, 152px for compact track/episode/show players and 352px for a full player with longer lists. Actual intermediate sizes should be verified. Spotify decides the playback experience for the listener and context. [Creating an Embed](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed), [Troubleshooting](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting).

Most Spotify direct and shortened `spotify.link` pages support oEmbed. QRK can accept a share link and use the Spotify-owned embed without adopting the iFrame API for programmatic control. Do not blindly render returned HTML: validate the resolved content identity and construct the documented embed URL. [Spotify oEmbed](https://developer.spotify.com/documentation/embeds/tutorials/using-the-oembed-api), [iFrame API](https://developer.spotify.com/documentation/embeds/references/iframe-api).

## Listening activity, deferred

Spotify documents authorized endpoints for the current user's [currently playing content](https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track) and [recently played tracks](https://developer.spotify.com/documentation/web-api/reference/get-recently-played); the latter does not support podcasts. Each requires the corresponding user scope. QRK currently has no identified private per-user provider token store or ongoing Spotify refresh mechanism; its existing provider imports are not an account connection.

Spotify says Development Mode requires the app owner to maintain Premium and permits up to five allowlisted authenticated users. Its extended-quota application criteria include an established organization and at least 250,000 monthly active users, with approval required. Therefore broad creator access to activity cannot be assumed. [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [Developer access update](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security).

## Terms and product boundary

Spotify's Widget Terms say use constitutes acceptance, constrain use on third-party-controlled sites, and state that the Play Button may not be used for commercial purposes while permitting it on sites containing advertising. On 2026-11-12 the user explicitly accepted the Widget Terms for QRK. How the commercial and third-party provisions apply to QRK and creator sites remains unresolved; acceptance does not determine compliance or authorize public deployment. [Spotify Widget Terms](https://developer.spotify.com/documentation/embeds/terms).

QRK already has a Music category and a shared Brick action menu. The embedded iframe is a separate browsing context, so interacting with it does not bubble to QRK's Brick selection handler; the agreed Edit menu action supplies a separate editor entry point. [Categories](../../apps/bricks/src/modules/react/categories.ts), [WallPlacement](../../apps/app/components/WallEditor/WallPlacement.tsx), [BrickDetailsTrigger](../../apps/bricks/src/components/BrickDetailsTrigger.tsx).
