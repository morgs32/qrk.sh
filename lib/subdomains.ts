export function isValidIcon(str: string) {
  if (str.length > 10) {
    return false;
  }

  try {
    // Primary validation: Check if the string contains at least one emoji character
    // This regex pattern matches most emoji Unicode ranges
    const emojiPattern = /[\p{Emoji}]/u;
    if (emojiPattern.test(str)) {
      return true;
    }
  } catch (error) {
    // If the regex fails (e.g., in environments that don't support Unicode property escapes),
    // fall back to a simpler validation
    console.warn("Emoji regex validation failed, using fallback validation", error);
  }

  // Fallback validation: Check if the string is within a reasonable length
  // This is less secure but better than no validation
  return str.length >= 1 && str.length <= 10;
}

type SubdomainData = {
  emoji: string;
  createdAt: number;
};

export async function getSubdomainData(subdomain: string) {
  const _sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, "");
  // TODO: wire up to a data store
  return null as SubdomainData | null;
}

export async function getAllSubdomains() {
  // TODO: wire up to a data store
  return [] as { subdomain: string; emoji: string; createdAt: number }[];
}
