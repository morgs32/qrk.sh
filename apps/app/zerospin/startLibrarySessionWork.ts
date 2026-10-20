import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import type { UserApp } from "./userSession";
import { startBrickSpecGeneration } from "./startBrickSpecGeneration";
import { startInstagramResolution } from "@qrk.sh/library/modules/instagram/startInstagramResolution";
import { startGithubActivityResolution } from "@qrk.sh/library/modules/githubActivity/startGithubActivityResolution";
import { startGithubProfileResolution } from "@qrk.sh/library/modules/githubProfile/startGithubProfileResolution";
import { startGithubRepoResolution } from "@qrk.sh/library/modules/githubRepo/startGithubRepoResolution";
import { startFigmaThumbnailResolution } from "@qrk.sh/library/modules/figmaThumbnail/startFigmaThumbnailResolution";
import { startLinkResolution } from "@qrk.sh/library/modules/link/startLinkResolution";
import { startMapPlaceResolution } from "@qrk.sh/library/modules/mapPlace/startMapPlaceResolution";

/** Keep pending provider work alive for the initialized App session. */
export function startLibrarySessionWork(session: ReturnType<typeof UserApp.useInitializedSession>) {
  const initialized = session.store.getState().initialized;
  if (initialized === null) return () => {};
  const { db } = initialized;
  const isCurrent = () => session.store.getState().initialized?.db === db;
  const readBrick = (id: `brk_${string}`) =>
    db.query.brick.findFirst({ where: { id: { eq: id } } }).sync();
  const subscribe = (listener: () => void) => db.$client.subscribeToTableChanges(listener);
  const stop = [
    startBrickSpecGeneration(session),
    startInstagramResolution({
      readBricks: () =>
        db.query.brick.findMany({ where: { moduleId: { eq: "instagram" } } }).sync(),
      readBrick,
      isCurrent,
      subscribe,
      complete: (payload) => {
        stageAggregateSessionCommand({ session, contractName: "completeInstagram", payload });
      },
    }),
    startGithubActivityResolution({
      readBricks: () =>
        db.query.brick.findMany({ where: { moduleId: { eq: "github-activity" } } }).sync(),
      readBrick,
      isCurrent,
      subscribe,
      complete: (payload) => {
        stageAggregateSessionCommand({ session, contractName: "completeGithubActivity", payload });
      },
    }),
    startGithubProfileResolution({
      readBricks: () =>
        db.query.brick.findMany({ where: { moduleId: { eq: "github-profile" } } }).sync(),
      readBrick,
      isCurrent,
      subscribe,
      complete: (payload) => {
        stageAggregateSessionCommand({ session, contractName: "completeGithubProfile", payload });
      },
    }),
    startGithubRepoResolution({
      readBricks: () =>
        db.query.brick.findMany({ where: { moduleId: { eq: "github-repo" } } }).sync(),
      readBrick,
      isCurrent,
      subscribe,
      complete: (payload) => {
        stageAggregateSessionCommand({ session, contractName: "completeGithubRepo", payload });
      },
    }),
    startFigmaThumbnailResolution({
      readBricks: () =>
        db.query.brick.findMany({ where: { moduleId: { eq: "figma-thumbnail" } } }).sync(),
      readBrick,
      isCurrent,
      subscribe,
      complete: (payload) => {
        stageAggregateSessionCommand({ session, contractName: "completeFigmaThumbnail", payload });
      },
    }),
    startLinkResolution({
      readBricks: () => db.query.brick.findMany({ where: { moduleId: { eq: "link" } } }).sync(),
      readBrick,
      isCurrent,
      subscribe,
      complete: (payload) => {
        stageAggregateSessionCommand({ session, contractName: "completeLink", payload });
      },
    }),
    startMapPlaceResolution({
      readBricks: () =>
        db.query.brick.findMany({ where: { moduleId: { eq: "map-place" } } }).sync(),
      readBrick,
      isCurrent,
      subscribe,
      complete: (payload) => {
        stageAggregateSessionCommand({ session, contractName: "completeMapPlace", payload });
      },
    }),
  ];
  return () => {
    for (const dispose of stop) dispose();
  };
}
