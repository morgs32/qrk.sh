export default async function UsernameDashboardPage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-medium">{username}</h1>
      <p className="text-sm text-muted-foreground">Dashboard</p>
    </main>
  );
}

