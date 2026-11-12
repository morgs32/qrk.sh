import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "./button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group";

export function ButtonExamples() {
  const [query, setQuery] = useState("Figma");

  return (
    <div className="grid gap-6">
      <section aria-label="Variants" className="flex flex-wrap items-center gap-2">
        <Button type="button">Default</Button>
        <Button type="button" variant="secondary">
          Secondary
        </Button>
        <Button type="button" variant="outline">
          Outline
        </Button>
        <Button type="button" variant="ghost">
          Ghost
        </Button>
        <Button type="button" variant="destructive">
          Destructive
        </Button>
        <Button type="button" variant="link">
          Link
        </Button>
      </section>
      <section aria-label="Sizes and states" className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm">
          Small
        </Button>
        <Button type="button" size="lg">
          Large
        </Button>
        <Button type="button" size="icon" variant="outline" aria-label="Add item">
          <Plus aria-hidden />
        </Button>
        <Button type="button" disabled>
          Disabled
        </Button>
      </section>
      <section aria-label="Input group button" className="w-[260px] max-w-full">
        <InputGroup variant="sm">
          <InputGroupInput
            aria-label="Search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")}>
              <X aria-hidden className="size-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </section>
    </div>
  );
}
