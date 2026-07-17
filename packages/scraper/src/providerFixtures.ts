export const linktreeFixtureJson = JSON.stringify({
  props: { pageProps: { account: { username: "miguelangeles" }, links: [{ title: "Example" }] } },
});

export const beaconsFixture = {
  username: "creator",
  source: "embedded",
  data: { page: { blocks: [{ type: "link", title: "Example" }] } },
};

export const instagramFixture = {
  username: "creator",
  data: { user: { username: "creator", is_private: false } },
};

export const tikTokFixture = {
  username: "creator",
  data: { UserModule: { users: { creator: { uniqueId: "creator" } } } },
};

export const youTubeFixture = {
  handle: "creator",
  data: { metadata: { channelMetadataRenderer: { vanityChannelUrl: "https://www.youtube.com/@creator" } } },
};

export const truthSocialFixture = {
  id: "1",
  username: "creator",
  acct: "creator",
  display_name: "Creator",
};
