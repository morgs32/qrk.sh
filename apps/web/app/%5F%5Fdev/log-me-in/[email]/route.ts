export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ email: string }> }) {
  const { params } = props;
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const { email } = await params;
  const { handleDevelopmentSignIn } = await import("../../../../dev/handleDevelopmentSignIn");
  return handleDevelopmentSignIn(request, email);
}

export const POST = GET;
