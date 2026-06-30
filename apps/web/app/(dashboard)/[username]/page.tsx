import { Button } from "@/components/ui/button";

export default async function UsernameDashboardPage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-medium">{username}</h1>
        <Button type="button">Create site</Button>
      </div>
      <p className="text-sm text-muted-foreground">Dashboard</p>
    </main>
  );
}

