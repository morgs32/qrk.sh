import { headers } from "next/headers";
import { UnderlinedLink } from "@/components/UnderlinedLink";
import { notFound } from "next/navigation";

export default async function SubdomainProofPage(props: {
  params: Promise<{ subdomain: string; path?: string[] }>;
}) {
  const { params } = props;
  const { subdomain, path } = await params;
  const hostname = (await headers()).get("host")?.toLowerCase().replace(/:\d+$/, "");
  if (
    process.env.NODE_ENV !== "development" ||
    hostname !== `${subdomain}.qrk.localhost`
  )
    notFound();

  return (
    <main className="flex min-h-screen flex-col gap-4 p-8">
      <h1 className="text-2xl">Subdomain routing proof</h1>
      <p>Subdomain: {subdomain}</p>
      <p>Path: /{(path ?? []).join("/")}</p>
      <nav className="flex gap-4">
        <UnderlinedLink className="no-underline!" href="/" size="lg">Home</UnderlinedLink>
        <UnderlinedLink className="no-underline!" href="/about" size="lg">About</UnderlinedLink>
      </nav>
    </main>
  );
}
