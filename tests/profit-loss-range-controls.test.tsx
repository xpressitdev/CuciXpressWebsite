// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import ProfitLossRangeControls, {
  validateProfitLossDateRange,
} from "@/components/admin/ProfitLossRangeControls";

function renderControls() {
  const onApply = vi.fn();
  function StatefulControls() {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    return (
      <ProfitLossRangeControls
        mode="custom"
        year={2026}
        years={[2025, 2026, 2027]}
        startDate={startDate}
        endDate={endDate}
        onModeChange={vi.fn()}
        onYearChange={vi.fn()}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onApply={onApply}
      />
    );
  }
  render(<StatefulControls />);
  return onApply;
}

describe("ProfitLossRangeControls", () => {
  it("validates paired inclusive dates before applying", () => {
    expect(validateProfitLossDateRange("", "2026-01-01")).toContain("both");
    expect(validateProfitLossDateRange("2026-02-02", "2026-02-01")).toContain("on or before");
    expect(validateProfitLossDateRange("2026-02-01", "2026-02-28")).toBeNull();
    expect(validateProfitLossDateRange("1999-12-31", "2000-01-01")).toContain("2000");
    expect(validateProfitLossDateRange("2020-01-01", "2026-01-01")).toContain("five years");
  });

  it("shows validation feedback and only applies a valid custom range", () => {
    const onApply = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("both");

    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-07-15" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2027-02-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ startDate: "2026-07-15", endDate: "2027-02-14" });
  });
});