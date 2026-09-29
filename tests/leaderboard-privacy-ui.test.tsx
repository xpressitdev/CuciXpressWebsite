// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("shows only the plate label, own car, and persists a toggle with loading and errors", async () => {
    const initial = {
      total_ranked: 2,
      my_rank: 2,
      my_washes: 1,
      show_full_plate_on_leaderboard: false,
      entries: [
        { rank: 1, masked_name: "A••• B•••", wash_count: 2, plate: "A•••45", is_me: false },
        { rank: 2, masked_name: "M•••", wash_count: 1, plate: "ME12345", is_me: true },
      ],
    };
    let saved = false;
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
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("Your car")).toBeInTheDocument();
    expect(screen.getByText("A••• B•••")).toBeInTheDocument();
    expect(screen.getByText("A•••45")).toBeInTheDocument();
    expect(screen.getByText("ME12345")).toBeInTheDocument();
    expect(screen.getByText(/your name is always censored/i)).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith("/api/customer/leaderboard/preference", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ show_full_plate_on_leaderboard: true }),
    }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/customer/leaderboard", expect.any(Object)));
  });

  it("keeps the setting unchanged and reports a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === "PATCH"
        ? { ok: false, status: 500, text: async () => "Save failed" }
        : { ok: true, json: async () => ({
          total_ranked: 0, my_rank: null, my_washes: 0,
          show_full_plate_on_leaderboard: false, entries: [],
        }) },
    ));
    render(<QueryClientProvider client={queryClient}><Leaderboard /></QueryClientProvider>);
    const toggle = await screen.findByRole("checkbox", { name: /show my full plate on the leaderboard/i });
    fireEvent.click(toggle);
    await screen.findByRole("alert");
    expect(toggle).not.toBeChecked();
  });
});