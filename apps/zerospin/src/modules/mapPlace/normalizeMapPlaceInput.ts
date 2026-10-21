export function normalizeMapPlaceInput(input: string) {
  try {
    const placeId = input.trim();
    return placeId.length > 0 ? placeId : undefined;
  } catch {
    return undefined;
  }
}
