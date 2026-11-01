import { Schema } from "effect";

const CurrentIdentity = Schema.Struct({
  currentUserId: Schema.NullOr(Schema.String),
});
const ClerkUsers = Schema.Array(Schema.Struct({ id: Schema.NonEmptyString }));
const SignInTicket = Schema.Struct({ token: Schema.NonEmptyString });

function safeReturnTo(value: string | null) {
  if (!value?.startsWith("/")) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith("//") ||
      /[\\\x00-\x20\x7f]/.test(value) ||
      /[\\\x00-\x20\x7f]/.test(decoded)
    )
      return "/";
    const target = new URL(value, "https://development.invalid");
    const decodedTarget = new URL(decoded, "https://development.invalid");
    if (
      target.origin !== "https://development.invalid" ||
      target.pathname.startsWith("//") ||
      /^\/(?:__dev|sign-in|sign-up)(?:\/|$)/i.test(decodeURIComponent(decodedTarget.pathname))
    )
      return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

export async function handleDevelopmentSignIn(request: Request, email: string) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (
    process.env.NODE_ENV !== "development" ||
    !publishableKey?.startsWith("pk_test_") ||
    !secretKey?.startsWith("sk_test_")
  )
    return new Response("Not found", { status: 404, headers });

  if (request.method === "GET") {
    const frontendApi = atob(publishableKey.slice(8)).replace(/\$$/, "");
    if (!/^[a-z0-9.-]+\.clerk\.accounts\.dev$/.test(frontendApi))
      return new Response("Invalid Clerk development configuration", {
        status: 500,
        headers,
      });
    const configuration = JSON.stringify({
      publishableKey,
      frontendApi,
      email,
    }).replaceAll("<", "\\u003c");
    return new Response(
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Development sign-in</title></head>
<body style="font:16px system-ui;max-width:560px;margin:80px auto;padding:24px">
<h1>Development sign-in</h1><p id="status" role="status">Loading Clerk…</p><button id="retry" type="button" hidden style="cursor:pointer">Retry</button>
<script>
const configuration = ${configuration};
const status = document.getElementById("status");
const retry = document.getElementById("retry");
retry.onclick = () => location.reload();
const fail = message => { status.setAttribute("role", "alert"); status.textContent = message; retry.hidden = false; };
const script = document.createElement("script");
script.crossOrigin = "anonymous";
script.dataset.clerkPublishableKey = configuration.publishableKey;
script.src = "https://" + configuration.frontendApi + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js";
script.onerror = () => fail("Could not load Clerk. Check your development configuration and retry.");
script.onload = async () => {
  try {
    const clerk = window.Clerk;
    await clerk.load();
    status.textContent = "Signing in as " + configuration.email + "…";
    const response = await fetch(location.href, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentUserId: clerk.user?.id ?? null }) });
    const result = await response.json();
    if (!response.ok || !result.ok) { fail(result.message ?? "Development sign-in is unavailable."); return; }
    if (clerk.user?.id !== result.userId) {
      if (clerk.session) { await clerk.session.end(); await clerk.setActive({ session: null }); }
      const attempt = await clerk.client.signIn.create({ strategy: "ticket", ticket: result.token });
      if (attempt.status !== "complete" || !attempt.createdSessionId) throw new Error("Incomplete sign-in");
      await clerk.setActive({ session: attempt.createdSessionId });
    }
    location.replace(result.returnTo);
  } catch { fail("Development sign-in failed. Check the Clerk development configuration and retry."); }
};
document.head.append(script);
</script></body></html>`,
      { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  if (request.method !== "POST")
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...headers, Allow: "GET, POST" },
    });
  const expectedOrigin = new URL(request.url);
  const publicHost = request.headers.get("Host");
  if (publicHost) {
    expectedOrigin.port = "";
    expectedOrigin.host = publicHost;
  }
  const forwardedProtocol = request.headers.get("X-Forwarded-Proto")?.split(",")[0]?.trim();
  if (forwardedProtocol === "http" || forwardedProtocol === "https")
    expectedOrigin.protocol = `${forwardedProtocol}:`;
  if (request.headers.get("Origin") !== expectedOrigin.origin) {
    return new Response("Forbidden", { status: 403, headers });
  }
  if (!email.trim() || email.length > 320)
    return Response.json(
      { ok: false, message: "Provide an existing development account email." },
      { status: 400, headers },
    );
  let currentUserId: unknown;
  try {
    ({ currentUserId } = Schema.decodeUnknownSync(CurrentIdentity)(await request.json()));
  } catch {
    return Response.json(
      { ok: false, message: "Invalid sign-in request." },
      { status: 400, headers },
    );
  }
  try {
    const query = new URLSearchParams({
      email_address: email.trim(),
      limit: "2",
    });
    const usersResponse = await fetch(`https://api.clerk.com/v1/users?${query}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!usersResponse.ok) throw new Error("Clerk lookup failed");
    const users = Schema.decodeUnknownSync(ClerkUsers)(await usersResponse.json());
    if (users.length !== 1 || typeof users[0]?.id !== "string")
      return Response.json(
        {
          ok: false,
          message:
            "No unique development account exists for that email in this application's Clerk instance.",
        },
        { status: 404, headers },
      );
    const userId = users[0].id;
    let token: string | null = null;
    if (currentUserId !== userId) {
      const tokenResponse = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId, expires_in_seconds: 60 }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tokenResponse.ok) throw new Error("Clerk ticket failed");
      const result = Schema.decodeUnknownSync(SignInTicket)(await tokenResponse.json());
      if (typeof result.token !== "string" || result.token === "")
        throw new Error("Clerk ticket missing");
      token = result.token;
    }
    return Response.json(
      {
        ok: true,
        userId,
        token,
        returnTo: safeReturnTo(new URL(request.url).searchParams.get("returnTo")),
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        message: "Clerk development sign-in is unavailable. Check the development keys and retry.",
      },
      { status: 503, headers },
    );
  }
}
