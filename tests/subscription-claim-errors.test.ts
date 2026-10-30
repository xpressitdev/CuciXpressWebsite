import { describe, expect, it } from "vitest";
import { isUniqueViolation, postgresErrorCode, subscriptionClaimConflict } from "../server/subscriptionClaimErrors";
import { subscriptionPaymentError } from "../client/src/lib/subscriptionPaymentError";

describe("subscription payment claim conflicts", () => {
  it("recognises wrapped PostgreSQL duplicate claims", () => {
    const error = new Error("Failed query: INSERT");
    (error as any).cause = { code: "23505" };
    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
  });
  it("handles nested and cyclic causes safely", () => {
    expect(postgresErrorCode({ cause: { cause: { code: "23505" } } })).toBe("23505");
    const cycle: any = {}; cycle.cause = cycle;
    expect(postgresErrorCode(cycle)).toBeUndefined();
  });
  it("distinguishes pending checkout from active membership", () => {
    expect(subscriptionClaimConflict("incomplete", 121.5)).toEqual({
      error: "checkout_in_progress", retry_after_seconds: 122,
    });
    expect(subscriptionClaimConflict("active", 0)).toEqual({ error: "already_subscribed" });
    expect(subscriptionClaimConflict("past_due", 0)).toEqual({ error: "already_subscribed" });
  });
  it("renders the actual apiRequest error format with a retry time", () => {
    const message = subscriptionPaymentError(new Error('409: {"error":"checkout_in_progress","retry_after_seconds":122}'));
    expect(message).toContain("3 minutes");
    expect(message).toContain("do not pay again");
  });
  it("does not expose raw server errors or falsely call a pending attempt active", () => {
    expect(subscriptionPaymentError(new Error('409: {"error":"already_subscribed"}'))).toContain("active subscription");
    expect(subscriptionPaymentError(new Error('409: {"error":"phone_in_use"}'))).toContain("phone number");
    expect(subscriptionPaymentError(new Error('500: {"error":"claim_failed"}'))).not.toContain("claim_failed");
  });
});
