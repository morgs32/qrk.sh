"use client";

import LibraryError from "./error";

export default function LibraryGlobalError(props: { error: unknown }) {
  const { error } = props;
  return (
    <html lang="en">
      <body>
        <LibraryError error={error} />
      </body>
    </html>
  );
}
