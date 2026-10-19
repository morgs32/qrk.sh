import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ReplacePage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const username = user.username;
  if (username) {
    const appOrigin = new URL(
      process.env.NEXT_PUBLIC_APP_ORIGIN ??
        (process.env.NODE_ENV === "production"
          ? "https://app.qrk.sh"
          : "https://app.qrk.localhost"),
    ).origin;
    redirect(`${appOrigin}/${username}`);
  }

  redirect("/");
}
