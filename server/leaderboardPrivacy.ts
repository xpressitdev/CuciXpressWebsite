/** Only the leaderboard uses this formatter; garage and POS plates remain unchanged. */
export function leaderboardPlate(plate: string | null, isMe: boolean, optedIn: boolean): string | null {
  if (plate === null) return null;
  if (isMe || optedIn) return plate;
  // Do not expose unusual whitespace or separators that might reveal a short plate.
  const normalized = plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized) return "•••";
  if (normalized.length <= 2) return "•".repeat(normalized.length);
  if (normalized.length <= 5) return "•".repeat(normalized.length - 1) + normalized.slice(-1);
  return normalized[0] + "•".repeat(normalized.length - 3) + normalized.slice(-2);
}