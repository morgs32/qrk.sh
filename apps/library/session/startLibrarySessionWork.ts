import { startBrickSpecGeneration } from "./startBrickSpecGeneration";
import { startInstagramResolution } from "../modules/instagram/startInstagramResolution";
import { startGithubActivityResolution } from "../modules/githubActivity/startGithubActivityResolution";
import { startGithubProfileResolution } from "../modules/githubProfile/startGithubProfileResolution";
import { startGithubRepoResolution } from "../modules/githubRepo/startGithubRepoResolution";
import { startFigmaThumbnailResolution } from "../modules/figmaThumbnail/startFigmaThumbnailResolution";
import { startLinkResolution } from "../modules/link/startLinkResolution";
import { startMapPlaceResolution } from "../modules/mapPlace/startMapPlaceResolution";
import type { ILibrarySession } from "./createLibraryStandaloneSession";

/** Compose module-owned local work for one initialized editing session. */
export function startLibrarySessionWork(session: ILibrarySession) {
  const stop = [
    startBrickSpecGeneration(session),
    startInstagramResolution(session),
    startGithubActivityResolution(session),
    startGithubProfileResolution(session),
    startGithubRepoResolution(session),
    startFigmaThumbnailResolution(session),
    startLinkResolution(session),
    startMapPlaceResolution(session),
  ];
  return () => {
    for (const dispose of stop) dispose();
  };
}
