export function normalizeLinkInput(input: string) {
  try {
    const url = new URL(input.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}
