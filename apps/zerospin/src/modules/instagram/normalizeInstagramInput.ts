export function normalizeInstagramInput(input: string) {
  try {
    const url = new URL(
      /^@?[a-z\d._]{1,30}$/i.test(input.trim())
        ? `https://www.instagram.com/${input.trim().replace(/^@/, "")}`
        : input.trim(),
    );
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      parts.length !== 1 ||
      !/^[a-z\d._]{1,30}$/i.test(parts[0])
    )
      return undefined;
    return `https://www.instagram.com/${parts[0].toLowerCase()}`;
  } catch {
    return undefined;
  }
}
