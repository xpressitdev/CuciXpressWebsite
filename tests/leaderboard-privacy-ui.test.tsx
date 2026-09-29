// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { queryClient } from "@/lib/queryClient";

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("leaderboard privacy controls", () => {
  it("shows full plates above censored names, own car badge, and saves an opt-out", async () => {
    const initial = {
      total_ranked: 2,
      my_rank: 2,
      my_washes: 1,
      show_full_plate_on_leaderboard: true,
      entries: [
        { rank: 1, masked_name: "A••• B•••", wash_count: 2, plate: "AB12345", is_me: false },
        { rank: 2, masked_name: "M•••", wash_count: 1, plate: "ME12345", is_me: true },
      ],
    };
    let saved = true;
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        saved = JSON.parse(options.body as string).show_full_plate_on_leaderboard;
        return { ok: true, json: async () => ({ show_full_plate_on_leaderboard: saved }) };
      }
      return { ok: true, json: async () => ({ ...initial, show_full_plate_on_leaderboard: saved }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={queryClient}><Leaderboard /></QueryClientProvider>);
    const toggle = await screen.findByRole("checkbox", { name: /show my full plate on the leaderboard/i });
    expect(toggle).toBeChecked();
    const other = within(screen.getByTestId("row-leaderboard-1"));
    const own = within(screen.getByTestId("row-leaderboard-2"));
    expect(other.getByText("AB12345")).toHaveClass("font-bold");
    expect(other.getByText("A••• B•••")).toHaveClass("text-gray-500");
    expect(other.getByText("AB12345").compareDocumentPosition(other.getByText("A••• B•••")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(own.getByText("ME12345")).toHaveClass("font-bold");
    expect(own.getByText("M•••")).toBeInTheDocument();
    expect(own.getByText("Your car")).toBeInTheDocument();
    expect(screen.getByText(/on by default.*turn off to mask your plate.*names are always censored/i)).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith("/api/customer/leaderboard/preference", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ show_full_plate_on_leaderboard: false }),
    }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/customer/leaderboard", expect.any(Object)));
  });

  it("keeps the setting unchanged and reports a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === "PATCH"
        ? { ok: false, status: 500, text: async () => "Save failed" }
        : { ok: true, json: async () => ({
          total_ranked: 0, my_rank: null, my_washes: 0,
          show_full_plate_on_leaderboard: true, entries: [],
        }) },
    ));
    render(<QueryClientProvider client={queryClient}><Leaderboard /></QueryClientProvider>);
    const toggle = await screen.findByRole("checkbox", { name: /show my full plate on the leaderboard/i });
    fireEvent.click(toggle);
    await screen.findByRole("alert");
    expect(toggle).toBeChecked();
  });
});