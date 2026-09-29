"use client";

import { defineRegistry } from "@json-render/react";
import type { ReactNode } from "react";

import { BrickShell } from "../../../components/brick/BrickShell";
import { layoutRegistryComponents } from "../../../lib/jsonRender/layoutRegistryComponents";
import { activityCalendarView } from "../ActivityCalendar";
import { githubActivityV1 } from "../githubActivityV1";

export const { registry } = defineRegistry(githubActivityV1.catalog, {
  components: {
    ...layoutRegistryComponents,
    BrickShell: (props: { children?: ReactNode }) => {
      const { children } = props;
      return <BrickShell className="bg-white">{children}</BrickShell>;
    },
    ActivityCalendar: activityCalendarView.RegistryComponent,
  },
});
