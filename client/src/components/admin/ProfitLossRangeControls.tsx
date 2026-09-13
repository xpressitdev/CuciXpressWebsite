import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type ProfitLossDateRange = {
  startDate: string;
  endDate: string;
};

export type ProfitLossRangeMode = "year" | "custom";

type ProfitLossRangeControlsProps = {
  mode: ProfitLossRangeMode;
  year: number;
  years: readonly number[];
  startDate: string;
  endDate: string;
  validationMessage?: string;
  onModeChange: (mode: ProfitLossRangeMode) => void;
  onYearChange: (year: number) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: (range: ProfitLossDateRange) => void;
};

/**
 * The date inputs intentionally remain draft values until Apply is pressed.
 * This keeps an incomplete range from issuing a request with only one bound
 * and lets an owner correct the dates without losing the currently displayed
 * report.
 */
export function validateProfitLossDateRange(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return "Choose both a start date and an end date.";
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || start.toISOString().slice(0, 10) !== startDate
    || end.toISOString().slice(0, 10) !== endDate
  ) {
    return "Enter valid ISO calendar dates.";
  }
  if (start > end) return "Start date must be on or before the end date.";
  if (start.getUTCFullYear() < 2000 || end.getUTCFullYear() > 2200) {
    return "Choose dates between 2000 and 2200.";
  }
  if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 5 * 366) {
    return "Choose a date range of no more than five years.";
  }
  return null;
}

export default function ProfitLossRangeControls({
  mode,
  year,
  years,
  startDate,
  endDate,
  validationMessage,
  onModeChange,
  onYearChange,
  onStartDateChange,
  onEndDateChange,
  onApply,
}: ProfitLossRangeControlsProps) {
  const [localValidation, setLocalValidation] = useState<string | null>(null);
  const error = validationMessage ?? localValidation;

  const apply = () => {
    const validation = validateProfitLossDateRange(startDate, endDate);
    setLocalValidation(validation);
    if (!validation) onApply({ startDate, endDate });
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="profit-loss-range-controls">
      <div className="flex items-center gap-1 rounded-md border p-1" role="group" aria-label="P&L range mode">
        <Button
          type="button"
          size="sm"
          variant={mode === "year" ? "secondary" : "ghost"}
          aria-pressed={mode === "year"}
          onClick={() => onModeChange("year")}
        >
          Year
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "custom" ? "secondary" : "ghost"}
          aria-pressed={mode === "custom"}
          onClick={() => onModeChange("custom")}
        >
          Custom
        </Button>
      </div>
      <Select
        value={String(year)}
        onValueChange={(value) => onYearChange(Number(value))}
        disabled={mode === "custom"}
      >
        <SelectTrigger className="w-24" aria-label="Report year">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
        </SelectContent>
      </Select>
      {mode === "custom" && (
        <div className="flex w-full min-w-0 flex-wrap items-end gap-2 pt-1">
          <div className="min-w-[9rem] flex-1 sm:flex-none">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="profit-loss-start-date">
              Start date
            </label>
            <Input
              id="profit-loss-start-date"
              aria-label="Start date"
              type="date"
              value={startDate}
              aria-invalid={Boolean(error) || undefined}
              onChange={(event) => {
                setLocalValidation(null);
                onStartDateChange(event.target.value);
              }}
            />
          </div>
          <div className="min-w-[9rem] flex-1 sm:flex-none">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="profit-loss-end-date">
              End date
            </label>
            <Input
              id="profit-loss-end-date"
              aria-label="End date"
              type="date"
              value={endDate}
              aria-invalid={Boolean(error) || undefined}
              onChange={(event) => {
                setLocalValidation(null);
                onEndDateChange(event.target.value);
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={apply}>Apply</Button>
          {error && <p className="w-full text-xs text-red-700" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}