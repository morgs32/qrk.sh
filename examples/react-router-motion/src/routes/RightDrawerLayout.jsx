import React from "react";
import { Outlet } from "react-router";
import { Shell } from "../Shell";

export const handle = { drawer: "right" };

export default function RightDrawerLayout() {
  return (
    <Shell side="right">
      <Outlet />
    </Shell>
  );
}
