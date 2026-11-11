"use client";

import { defineRegistry } from "@json-render/react";
import { makeCatalogFromComponentMetadata } from "../../../../definition/makeCatalogFromComponentMetadata";

import type { ReactNode } from "react";

import { BrickShell } from "../../../../components/BrickShell";
import { layoutRegistryComponents } from "../../../react/layoutRegistryComponents";
import { activityCalendarView } from "../ActivityCalendar";
import { githubActivityV1 } from "../../definition/githubActivityV1";

export const { registry } = defineRegistry(
  makeCatalogFromComponentMetadata(githubActivityV1.componentMetadata),
  {
    components: {
      ...layoutRegistryComponents,
      BrickShell: (props: { children?: ReactNode }) => {
        const { children } = props;
        return <BrickShell className="bg-white">{children}</BrickShell>;
      },
      ActivityCalendar: activityCalendarView.RegistryComponent,
    },
  },
);
