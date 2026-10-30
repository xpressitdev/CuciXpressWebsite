/** Drizzle wraps PostgreSQL errors in `cause`; never log the SQL/parameters. */
export function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current.code === "string") return current.code;
    current = current.cause;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === "23505";
}

export function subscriptionClaimConflict(
  status: string | undefined,
  retrySeconds: number,
) {
  return status === "incomplete"
    ? {
        error: "checkout_in_progress",
        retry_after_seconds: Math.max(1, Math.ceil(retrySeconds)),
      }
    : { error: "already_subscribed" };
}
