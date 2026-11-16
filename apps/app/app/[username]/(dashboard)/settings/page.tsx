"use client";

import { useAuth } from "@clerk/react";
import { Button } from "@qrk.sh/bricks/components/button";
import { Field, FieldDescription, FieldLabel } from "@qrk.sh/bricks/components/field";
import { Input } from "@qrk.sh/bricks/components/Input";
import { useLiveQuery, useSession } from "@zerospin/react";
import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import { userSessionDefinition } from "@/zerospin/userSessionDefinition";

export default function SettingsPage() {
  const session = useSession(userSessionDefinition);
  const { getToken } = useAuth();
  const [draft, setDraft] = useState<string | null>(null);
  const [availability, setAvailability] = useState<
    "idle" | "checking" | "available" | "taken" | "unavailable"
  >("idle");
  const [checkedUsername, setCheckedUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: user } = useLiveQuery({
    session,
    query: (db) => {
      const state = session.store.getState();
      if (state.initialized === null) throw new Error("Your session is not ready");
      return db.query.user.findFirst({
        where: { clerkUserId: { eq: state.initialized.claims.clerkUserId } },
      });
    },
  });
  const { data: status } = useLiveQuery({
    session,
    query: (db) => {
      const state = session.store.getState();
      if (state.initialized === null) throw new Error("Your session is not ready");
      return db.query.usernameStatus.findFirst({
        where: { user: { clerkUserId: { eq: state.initialized.claims.clerkUserId } } },
      });
    },
  });
  const value = draft ?? user?.username ?? "";
  const valid = /^[a-z0-9]{1,56}$/.test(value);
  const changed = value !== (user?.username ?? "");
  const currentAvailability = checkedUsername === value ? availability : "idle";
  useEffect(() => {
    if (!valid || !changed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setCheckedUsername(value);
      setAvailability("checking");
      void (async () => {
        try {
          const token = await getToken();
          if (token === null) throw new Error("Sign in to check availability");
          const url = new URL(
            "/api/usernames/availability",
            process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "https://qrk.localhost",
          );
          url.searchParams.set("username", value);
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) throw new Error("Could not check username availability");
          const result = Schema.decodeUnknownSync(Schema.Struct({ available: Schema.Boolean }))(
            await response.json(),
          );
          if (!controller.signal.aborted) setAvailability(result.available ? "available" : "taken");
        } catch {
          if (!controller.signal.aborted) setAvailability("unavailable");
        }
      })();
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [changed, getToken, valid, value]);

  if (user === undefined) return <p role="alert">User not found</p>;
  const saving = status?.pending !== null && status?.pending !== undefined;
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-xl font-medium">Settings</h1>
      <form
        className="mt-6 flex max-w-md flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !changed || currentAvailability !== "available" || saving) return;
          setError(null);
          const result = stageAggregateSessionCommand({
            session,
            contractName: "requestUsername",
            payload: { userId: user.id, username: value },
          });
          if (result._tag === "Failure") setError(result.failure.message);
        }}
      >
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input
            id="username"
            value={value}
            maxLength={56}
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.target.value.toLowerCase());
              setCheckedUsername(null);
              setAvailability("idle");
              setError(null);
            }}
          />
          <FieldDescription>
            Use lowercase letters and numbers, up to 56 characters.
          </FieldDescription>
        </Field>
        {saving ? (
          <p role="status">Saving username…</p>
        ) : changed && valid && currentAvailability === "checking" ? (
          <p role="status">Checking availability…</p>
        ) : changed && valid && currentAvailability === "available" ? (
          <p role="status">Available</p>
        ) : changed && valid && currentAvailability === "taken" ? (
          <p role="status">Already taken</p>
        ) : changed && valid && currentAvailability === "unavailable" ? (
          <p role="alert">Could not check availability</p>
        ) : null}
        {(error ?? status?.failure) ? <p role="alert">{error ?? status?.failure}</p> : null}
        <Button
          type="submit"
          disabled={!valid || !changed || currentAvailability !== "available" || saving}
        >
          Save username
        </Button>
      </form>
    </main>
  );
}
