"use client";

import LibraryError from "./error";

export default function NotFound() {
  return (
    <LibraryError
      error={Object.assign(new Error("The requested page was not found."), { name: "NotFound" })}
    />
  );
}
