import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { dashboardPattern } from "@/app/(site)/site/[siteId]/routePatterns";

export default async function PostAuthPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const username = user.username;
  if (username) {
    redirect(dashboardPattern.href({ username }));
  }

  redirect("/");
}
