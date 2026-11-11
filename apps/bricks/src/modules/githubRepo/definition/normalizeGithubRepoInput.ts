export function normalizeGithubRepoInput(input: string) {
  try {
    const text = input.trim();
    const url = new URL(/^[^/\s]+\/[^/\s]+$/.test(text) ? `https://github.com/${text}` : text);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      parts.length !== 2 ||
      !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(parts[0]) ||
      !/^[a-z\d._-]+$/i.test(parts[1])
    )
      return undefined;
    const repository = parts[1].replace(/\.git$/i, "");
    if (repository.length === 0) return undefined;
    return `https://github.com/${parts[0].toLowerCase()}/${repository}`;
  } catch {
    return undefined;
  }
}
