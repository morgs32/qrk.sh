import { useParams } from "react-router";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";

import type { IProfilerProfile } from "../../types.js";
import { zerospinDevtoolsStore } from "../../zerospinDevtoolsStore.js";

export function useProfileForRoute(): IProfilerProfile | undefined {
  const { profileId } = useParams();
  return useStore(
    zerospinDevtoolsStore,
    useShallow((state) =>
      profileId !== undefined
        ? state.profiles.find((p: IProfilerProfile) => p.id === profileId)
        : undefined,
    ),
  );
}
