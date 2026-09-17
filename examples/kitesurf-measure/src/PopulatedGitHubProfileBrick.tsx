import { githubProfileFrontend } from "../../../apps/library/modules/githubProfile/githubProfileFrontend";

import avatarUrl from "./assets/avatar.jpg";
import { BREAKPOINTS } from "./breakpoints";

const PROFILE_DATA = {
  avatar_url: avatarUrl,
  login: "morgs32",
  bio: "Last action hero",
  location: "Charlottesville, VA",
  blog: "http://www.morganatwork.com",
  followers: 40,
  following: 143,
  public_repos: 31,
};

const Brick = githubProfileFrontend.component;

export function PopulatedGitHubProfileBrick(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
}) {
  return <Brick breakpoint={props.breakpoint} data={PROFILE_DATA} />;
}
