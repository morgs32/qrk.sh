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

export const gitHubFixture = {
  login: "octocat",
  id: 1,
  node_id: "MDQ6VXNlcjE=",
  avatar_url: "https://github.com/images/error/octocat_happy.gif",
  html_url: "https://github.com/octocat",
  name: "The Octocat",
  company: "GitHub",
  blog: "https://github.blog",
  location: "San Francisco",
  email: "octocat@github.com",
  bio: "A complete provider-native profile fixture",
  public_repos: 8,
  followers: 100,
  following: 2,
  custom_future_field: { retained: true },
};
