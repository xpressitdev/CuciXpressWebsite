// @vitest-environment jsdom
//
// CTA regression matrix for ActiveSubscriptionHero (OverviewTab).
//
// Guards the July 2026 "no QR option" bug: an active Unlimited member
// within 7 days of expiry must ALWAYS keep the "Show wash QR" button —
// the "Renew" CTA is added ALONGSIDE it, never as a replacement.
//
// Matrix:
//   1. Unlimited, not expiring soon  -> QR only (no Renew)
//   2. Unlimited, expiring <= 7 days -> QR + Renew
//   3. Wash pack                     -> "Use my plan" only (no QR)
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveSubscriptionHero } from "@/components/dashboard/OverviewTab";
import type { MembershipRow, QueueBranch } from "@/components/dashboard/types";

afterEach(cleanup);

const DAY_MS = 24 * 60 * 60 * 1000;

function makeMembership(overrides: Partial<MembershipRow> = {}): MembershipRow {
  return {
    id: "m-1",
    kind: "unlimited",
    total_washes: 0,
    remaining_washes: 0,
    status: "active",
    expires_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    created_at: new Date(Date.now() - 30 * DAY_MS).toISOString(),
    price_cents: 6900,
    sold_at_branch_name: null,
    vehicle_id: 1,
    vehicle_plate: "BAA 1234",
    ...overrides,
  };
}

const bestBranch: QueueBranch = {
  id: 1,
  name: "Cuci Xpress Gadong",
  location: null,
  is_open: true,
  washing_count: 1,
  queued_count: 2,
  today_total: 12,
  est_wait_minutes: 15,
};

function renderHero(membership: MembershipRow) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ActiveSubscriptionHero
        membership={membership}
        bestBranch={bestBranch}
        onManage={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("ActiveSubscriptionHero CTA matrix", () => {
  it("unlimited, not expiring soon: shows wash QR only, no Renew", () => {
    renderHero(makeMembership()); // expires in 30 days

    const qr = screen.getByTestId("button-hero-wash-qr");
    expect(qr).toBeInTheDocument();
    expect(qr).toHaveTextContent(/show wash qr/i);
    expect(screen.queryByTestId("button-hero-pay")).not.toBeInTheDocument();
  });

  it("unlimited, expiring within 7 days: keeps wash QR AND adds Renew", () => {
    renderHero(
      makeMembership({ expires_at: new Date(Date.now() + 3 * DAY_MS).toISOString() }),
    );

    // Regression guard: QR must never disappear for an active member.
    expect(screen.getByTestId("button-hero-wash-qr")).toBeInTheDocument();

    const renew = screen.getByTestId("button-hero-pay");
    expect(renew).toBeInTheDocument();
    expect(renew).toHaveTextContent(/renew/i);
    expect(renew).toHaveAttribute("href", "/subscriptions");
  });

  it("unlimited, expiring exactly today (boundary): still keeps wash QR + Renew", () => {
    renderHero(
      makeMembership({ expires_at: new Date(Date.now() + 60 * 1000).toISOString() }),
    );

    expect(screen.getByTestId("button-hero-wash-qr")).toBeInTheDocument();
    expect(screen.getByTestId("button-hero-pay")).toHaveTextContent(/renew/i);
  });

  it("wash pack: shows 'Use my plan' and never the membership QR", () => {
    renderHero(
      makeMembership({
        kind: "pack",
        total_washes: 5,
        remaining_washes: 3,
      }),
    );

    expect(screen.queryByTestId("button-hero-wash-qr")).not.toBeInTheDocument();

    const cta = screen.getByTestId("button-hero-pay");
    expect(cta).toHaveTextContent(/use my plan/i);
    expect(cta).toHaveAttribute("href", "/checkout");
  });

  it("wash pack expiring soon: still 'Use my plan', no Renew relabel, no QR", () => {
    renderHero(
      makeMembership({
        kind: "pack",
        total_washes: 5,
        remaining_washes: 1,
        expires_at: new Date(Date.now() + 2 * DAY_MS).toISOString(),
      }),
    );

    expect(screen.queryByTestId("button-hero-wash-qr")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-hero-pay")).toHaveTextContent(/use my plan/i);
  });
});
