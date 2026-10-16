export function normalizeFigmaThumbnailInput(input: string) {
  try {
    const url = new URL(input.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      !["figma.com", "www.figma.com"].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      !["design", "file", "board", "slides", "deck", "proto"].includes(parts[0]) ||
      !/^[a-zA-Z0-9]{22,128}$/.test(parts[1] ?? "")
    )
      return undefined;
    const kind = parts[0] === "file" ? "design" : parts[0] === "deck" ? "slides" : parts[0];
    return `https://www.figma.com/${kind}/${parts[1]}`;
  } catch {
    return undefined;
  }
}
