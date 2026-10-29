"use client";

import { useSearch } from "@tanstack/react-router";
import { useLiveQuery } from "@zerospin/react";
import { makeIdSchema, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";
import { Schema } from "effect";
import { useId, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";

const ParamsSchema = Schema.Struct({
  username: Schema.String,
  siteId: makeIdSchema(siteV1),
  pageId: makeIdSchema(pageV1),
  stackId: Schema.String,
});

export function StackDetails() {
  const params = useValidatedParams(ParamsSchema);
  const search = useSearch({ from: "/$username/site/$siteId/page/$pageId" });
  const session = UserUI.useSession();
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: wall } = useLiveQuery({
    session,
    key: { siteId: params.siteId, pageId: params.pageId, breakpoint: search.breakpoint },
    query: (db, { siteId, pageId, breakpoint }) =>
      db.query.wall.findFirst({
        where: {
          pageId: { eq: pageId },
          breakpoint: { eq: breakpoint },
          page: { siteId: { eq: siteId } },
        },
      }),
  });
  const stack = wall?.layout.sections
    .flatMap((section) => section.stacks)
    .find((entry) => entry.id === params.stackId);

  useLayoutEffect(() => {
    setDraft(null);
    setSaveError(null);
  }, [params.stackId, search.breakpoint]);

  if (wall === undefined || stack === undefined)
    return (
      <div className="px-6 pt-6">
        <h1 className="mb-2 text-2xl tracking-tight">Stack not found</h1>
        <p className="text-muted-foreground">This stack is not available in the current Wall.</p>
      </div>
    );

  const name = draft ?? stack.name;
  const trimmedName = name.trim();
  const isChanged = trimmedName !== stack.name.trim();

  return (
    <form
      autoComplete="off"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmedName.length === 0) {
          setSaveError("Enter a stack name.");
          return;
        }
        if (!isChanged) return;
        const result = stageAggregateSessionCommand({
          session,
          contractName: "renameStack",
          payload: { wallId: wall.id, stackId: stack.id, name: trimmedName },
        });
        if (result._tag === "Failure") {
          setSaveError(result.failure.message);
          return;
        }
        setDraft(null);
        setSaveError(null);
      }}
    >
      <div className="flex flex-col gap-2">
        <label className="font-medium" htmlFor={inputId}>
          Stack name
        </label>
        <Input
          id={inputId}
          name="stackName"
          value={name}
          aria-invalid={saveError !== null}
          aria-describedby={saveError === null ? undefined : `${inputId}-error`}
          onChange={(event) => {
            setDraft(event.target.value);
            setSaveError(null);
          }}
        />
      </div>
      {saveError === null ? null : (
        <p id={`${inputId}-error`} className="m-0" role="alert">
          {saveError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft(null);
            setSaveError(null);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!isChanged}>
          Save
        </Button>
      </div>
    </form>
  );
}
