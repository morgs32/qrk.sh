"use client";

import { makeId, stageServiceSessionCommand } from "@zerospin/sdk/browser";
import { useClaims, useLiveQuery, useSession } from "@zerospin/react";
import { instagramVerificationChallengeV1 } from "@qrk.sh/zerospin/src/services/instagramVerification/models/instagramVerificationChallenge/instagramVerificationChallengeV1";
import { receivingUsername } from "@qrk.sh/zerospin/src/services/instagramVerification/instagramVerificationPolicy";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { instagramVerificationSessionDefinition } from "@/zerospin/instagramVerificationSessionDefinition";

export function InstagramVerificationCard() {
  const session = useSession(instagramVerificationSessionDefinition);
  const { clerkUserId } = useClaims(session);
  const [now, setNow] = useState(Date.now);
  const { data: accounts } = useLiveQuery({
    session,
    key: clerkUserId,
    query: (db, owner) =>
      db.query.verifiedInstagramAccount.findMany({
        where: { clerkUserId: { eq: owner } },
        orderBy: { verifiedAt: "desc" },
      }),
  });
  const { data: challenges } = useLiveQuery({
    session,
    key: clerkUserId,
    query: (db, owner) =>
      db.query.instagramVerificationChallenge.findMany({
        where: { clerkUserId: { eq: owner } },
        orderBy: { createdAt: "desc" },
      }),
  });
  const challenge =
    challenges.find(
      (entry) => entry.state.status === "pending" || entry.state.status === "resolving",
    ) ?? challenges[0];

  useEffect(() => {
    if (challenge?.state.status !== "pending") return;
    const expiresAt = challenge.expiresAt.getTime();
    setNow(Date.now());
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, expiresAt - Date.now()) + 1,
    );
    return () => window.clearTimeout(timeout);
  }, [challenge?.id, challenge?.expiresAt, challenge?.state.status]);

  const expired = challenge?.state.status === "pending" && challenge.expiresAt.getTime() <= now;

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border p-4"
      aria-labelledby="instagram-verification-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="instagram-verification-title" className="font-medium">
            Instagram accounts
          </h2>
          <p className="text-sm text-muted-foreground">
            Verify an account by sending a code from it on Instagram.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            const code = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
            stageServiceSessionCommand({
              session,
              contractName: "startInstagramVerification",
              payload: {
                id: session.runSync(makeId(instagramVerificationChallengeV1)),
                code,
              },
            });
          }}
        >
          {challenge?.state.status === "pending" || challenge?.state.status === "resolving"
            ? "New code"
            : accounts.length > 0
              ? "Verify another account"
              : "Verify Instagram account"}
        </Button>
      </div>

      {accounts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Verified{" "}
                  <a
                    href={`https://www.instagram.com/${account.username}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    @{account.username}
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">
                  Control verified {account.verifiedAt.toLocaleDateString()}.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Disconnect @${account.username}`}
                onClick={() => {
                  stageServiceSessionCommand({
                    session,
                    contractName: "disconnectInstagramAccount",
                    payload: { id: account.id },
                  });
                }}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {challenge?.state.status === "pending" && !expired ? (
        <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
          <p className="text-sm">
            Send this code in a direct message to{" "}
            <a
              href={`https://www.instagram.com/${receivingUsername}/`}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              @{receivingUsername}
            </a>{" "}
            from the account you want to verify.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <code className="break-all select-all text-sm">{challenge.code}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  .writeText(challenge.code)
                  .then(() => toast.success("Verification code copied"))
                  .catch(() => toast.error("Could not copy the verification code."));
              }}
            >
              Copy code
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Expires at{" "}
            {challenge.expiresAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. A
            new code replaces this attempt.
          </p>
        </div>
      ) : null}
      <div role="status" aria-live="polite" className="text-sm">
        {expired ? <p>This code expired. Create a new code to try again.</p> : null}
        {challenge?.state.status === "resolving" ? (
          <p>Message received. Confirming your Instagram account…</p>
        ) : null}
        {challenge?.state.status === "failed" ? (
          <p className="text-destructive">
            {challenge.state.error.message} Create a new code to try again.
          </p>
        ) : null}
        {challenge?.state.status === "superseded" ? (
          <p className="text-muted-foreground">This verification attempt is no longer active.</p>
        ) : null}
      </div>
    </section>
  );
}
