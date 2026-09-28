import { githubProfileView } from "../../../apps/library/modules/githubProfile/githubProfileView";

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

const Brick = githubProfileView.component;

export function PopulatedGitHubProfileBrick(props: {
  breakpoint: (typeof BREAKPOINTS)[number]["id"];
}) {
  return (
    <Brick
      breakpoint={props.breakpoint}
      state={{ payload: { url: "https://github.com/morgs32" }, data: PROFILE_DATA }}
      spec={githubProfileView.defaultSpec}
    />
  );
}
