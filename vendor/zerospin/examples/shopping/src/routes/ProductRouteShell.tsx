export function ProductRouteShell(props: { productId: string }) {
  const { productId } = props;

  return (
    <main className="bg-muted/30 min-h-svh px-6 py-12">
      <section className="bg-card mx-auto max-w-3xl rounded-xl border p-8 shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">Product</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {productId}
        </h1>
        <div
          aria-label="Loading account-specific product actions"
          className="bg-muted mt-8 h-24 animate-pulse rounded-lg"
        />
      </section>
    </main>
  );
}
