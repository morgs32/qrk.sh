"use client";

import { useAuth } from "@clerk/react";
import { Button } from "@qrk.sh/bricks/components/button";
import { Field, FieldDescription, FieldLabel } from "@qrk.sh/bricks/components/field";
import { Input } from "@qrk.sh/bricks/components/Input";
import { useLiveQuery, useSession } from "@zerospin/react";

import { assignUsernameResult } from "@qrk.sh/zerospin/src/services/users/AssignUsernameV1";
import { Schema } from "effect";
import { useEffect, useState } from "react";
import { usersSessionDefinition } from "@/zerospin/usersSessionDefinition";

export default function SettingsPage() {
  const session = useSession(usersSessionDefinition);
  const { getToken } = useAuth();
  const [draft, setDraft] = useState<string | null>(null);
  const [availability, setAvailability] = useState<
    "idle" | "checking" | "available" | "taken" | "unavailable"
  >("idle");
  const [checkedUsername, setCheckedUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: claim } = useLiveQuery({ session, query: (db) => db.query.username.findFirst({}) });
  const { data: failures } = useLiveQuery({
    session,
    query: (db) => db.query.usernameFailure.findMany({ orderBy: { createdAt: "desc" } }),
  });
  const value = draft ?? claim?.username ?? "";
  const valid = /^[a-z0-9]{1,56}$/.test(value);
  const changed = value !== (claim?.username ?? "");
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

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-xl font-medium">Settings</h1>
      <form
        className="mt-6 flex max-w-md flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid || !changed || currentAvailability !== "available" || saving) return;
          setError(null);
          setSaving(true);
          void (async () => {
            try {
              const token = await getToken();
              if (token === null) throw new Error("Sign in to assign a username");
              const url = new URL(
                "/api/usernames/assignment",
                process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "https://qrk.localhost",
              );
              const response = await fetch(url, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ username: value }),
              });
              const result = Schema.decodeUnknownSync(assignUsernameResult)(await response.json());
              if (result.status === "rejected") setError(result.message);
              else {
                setDraft(result.username);
                setAvailability("idle");
              }
            } catch {
              setError(
                "The assignment outcome is unavailable. Check your saved username before trying again.",
              );
            } finally {
              setSaving(false);
            }
          })();
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
        {error ? <p role="alert">{error}</p> : null}
        <Button
          type="submit"
          disabled={!valid || !changed || currentAvailability !== "available" || saving}
        >
          Save username
        </Button>
      </form>
      {failures.length > 0 ? (
        <section className="mt-6" aria-label="Username assignment failures">
          <h2>Failed assignments</h2>
          <ul>
            {failures.map((failure) => (
              <li key={failure.id}>
                {failure.username}: {failure.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
