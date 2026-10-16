export function normalizeGithubProfileInput(input: string) {
  try {
    const url = new URL(
      /^@?[a-z\d][a-z\d-]*$/i.test(input.trim())
        ? `https://github.com/${input.trim().replace(/^@/, "")}`
        : input.trim(),
    );
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      parts.length !== 1 ||
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(parts[0])
    )
      return undefined;
    return `https://github.com/${parts[0].toLowerCase()}`;
  } catch {
    return undefined;
  }
}
