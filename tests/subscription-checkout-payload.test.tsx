// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SubscriptionCheckout } from "@/components/SubscriptionCheckout";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.querySelectorAll('script[data-uc-lib="1"]').forEach((node) => node.remove());
  delete window.Accept;
});

describe("SubscriptionCheckout covered-vehicle contract", () => {
  it("sends the selected covered plates to CyberSource confirmation", async () => {
    const capturePayload = btoa(JSON.stringify({
      ctx: [{ data: { clientLibrary: "/mock-cybersource.js" } }],
    })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const captureContext = `header.${capturePayload}.signature`;
    const requestMock = vi.mocked(apiRequest);
    requestMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ captureContext })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

    const originalAppend = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation((node: Node) => {
      const result = originalAppend(node);
      if (node instanceof HTMLScriptElement) {
        window.Accept = vi.fn(async () => ({
          unifiedPayments: async () => ({
            show: async () => "transient-token-for-test",
          }),
        }));
        queueMicrotask(() => node.onload?.(new Event("load")));
      }
      return result;
    });

    render(
      <SubscriptionCheckout
        planId="family"
        phone="+6737000000"
        carPlate="BAA1234, BBB5678"
        onSuccess={() => {}}
      />,
    );

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    expect(requestMock).toHaveBeenLastCalledWith(
      "POST",
      "/api/subscriptions/confirm",
      {
        plan_id: "family",
        transientToken: "transient-token-for-test",
        phone: "+6737000000",
        car_plate: "BAA1234, BBB5678",
      },
    );
  });
});