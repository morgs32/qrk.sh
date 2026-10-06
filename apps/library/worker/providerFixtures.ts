export const instagramFixture = {
  username: "creator",
  profileImageUrl: "https://example.com/profile.jpg",
  followersText: "12.2K",
  postImageUrls: [
    "https://example.com/post-1.jpg",
    "https://example.com/post-2.jpg",
    "https://example.com/post-3.jpg",
    "https://example.com/post-4.jpg",
  ],
};

export const tikTokFixture = {
  username: "creator",
  data: { UserModule: { users: { creator: { uniqueId: "creator" } } } },
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
