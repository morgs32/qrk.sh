"use client";

import { useId, useState } from "react";

import { Input } from "../../components/ui/input";

export function GitHubProfileForm() {
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [profile, setProfile] = useState("");
  const value = profile.trim();
  const isUsername = /^@?[a-z\d][a-z\d-]*$/i.test(value);

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label className="font-medium" htmlFor={inputId}>
        GitHub profile URL or username
      </label>
      <Input
        aria-describedby={feedbackId}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        id={inputId}
        onChange={(event) => {
          setProfile(event.target.value);
        }}
        placeholder="https://github.com/octocat or octocat"
        spellCheck={false}
        type="text"
        value={profile}
      />
      <p aria-live="polite" className="m-0 break-words" id={feedbackId}>
        {isUsername
          ? `Profile URL: https://github.com/${value.replace(/^@/, "")}`
          : "Enter a GitHub profile URL or a username."}
      </p>
    </form>
  );
}
