import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ReplacePage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const username = user.username;
  if (username) {
    redirect(`/${username}`);
  }

  redirect("/");
}
