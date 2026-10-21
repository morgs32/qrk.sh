"use client";

import { defineRegistry } from "@json-render/react";
import type { ReactNode } from "react";

import { BrickShell } from "../../components/brick/BrickShell";
import { layoutRegistryComponents } from "../../lib/jsonRender/layoutRegistryComponents";
import { activityCalendarView } from "../ActivityCalendar";
import { githubActivityV2 } from "@qrk.sh/zerospin/src/modules/githubActivity/githubActivityV2";

export const { registry } = defineRegistry(githubActivityV2.catalog, {
  components: {
    ...layoutRegistryComponents,
    BrickShell: (props: { children?: ReactNode }) => {
      const { children } = props;
      return <BrickShell className="bg-white">{children}</BrickShell>;
    },
    ActivityCalendar: activityCalendarView.RegistryComponent,
  },
});
