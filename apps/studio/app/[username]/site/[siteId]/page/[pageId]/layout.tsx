import type { ReactNode } from "react";
import UserLayout from "@/app/[username]/UserLayout";
import SiteLayout from "../../SiteLayout";
import EditorLayout from "./EditorLayout";

export default function PageLayout(props: { children: ReactNode }) {
  const { children } = props;
  return (
    <UserLayout>
      <SiteLayout>
        <EditorLayout>{children}</EditorLayout>
      </SiteLayout>
    </UserLayout>
  );
}
