import { useState } from "react";
import { Calendar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type DateRangePreset = "all" | "7d" | "30d" | "3m" | "1y" | "custom";

export interface DateRange {
  preset: DateRangePreset;
  // ISO yyyy-mm-dd; only used when preset === "custom"
  from?: string;
  to?: string;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "1y", label: "Last 12 months" },
];

// Resolve a DateRange to absolute Date bounds (or null = unbounded).
export function resolveRange(r: DateRange): { from: Date | null; to: Date | null } {
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (r.preset === "all") return { from: null, to: null };
  if (r.preset === "custom") {
    return {
      from: r.from ? startOfDay(new Date(r.from)) : null,
      to: r.to ? endOfDay(new Date(r.to)) : null,
    };
  }
  const days =
    r.preset === "7d" ? 7 : r.preset === "30d" ? 30 : r.preset === "3m" ? 90 : 365;
  const from = startOfDay(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { from, to: endOfDay(now) };
}

export function rangeLabel(r: DateRange): string {
  if (r.preset === "all") return "All time";
  if (r.preset === "custom") {
    if (r.from && r.to) return `${r.from} → ${r.to}`;
    if (r.from) return `From ${r.from}`;
    if (r.to) return `Until ${r.to}`;
    return "Custom range";
  }
  return PRESETS.find((p) => p.value === r.preset)?.label ?? "All time";
}

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export function DateRangeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(value);
  const isFiltering = value.preset !== "all";

  const apply = (r: DateRange) => {
    onChange(r);
    setDraft(r);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setDraft(value); }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={
              isFiltering
                ? "bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                : ""
            }
            data-testid="button-date-filter"
          >
            <Calendar className="w-4 h-4 mr-1.5" />
            {rangeLabel(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <div className="space-y-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => apply({ preset: p.value })}
                className={
                  "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition " +
                  (value.preset === p.value
                    ? "bg-gradient-to-r from-purple-600 to-orange-500 text-white"
                    : "hover:bg-gray-100 text-gray-700")
                }
                data-testid={`button-date-preset-${p.value}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-2">
              Custom range
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="dr-from" className="text-xs text-gray-600">
                  From
                </Label>
                <Input
                  id="dr-from"
                  type="date"
                  value={draft.from ?? ""}
                  onChange={(e) =>
                    setDraft({ preset: "custom", from: e.target.value, to: draft.to })
                  }
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <Label htmlFor="dr-to" className="text-xs text-gray-600">
                  To
                </Label>
                <Input
                  id="dr-to"
                  type="date"
                  value={draft.to ?? ""}
                  onChange={(e) =>
                    setDraft({ preset: "custom", from: draft.from, to: e.target.value })
                  }
                  data-testid="input-date-to"
                />
              </div>
            </div>
            <Button
              size="sm"
              className="mt-2 w-full bg-gradient-to-r from-purple-600 to-orange-500 text-white"
              onClick={() => apply({ ...draft, preset: "custom" })}
              disabled={!draft.from && !draft.to}
              data-testid="button-date-apply"
            >
              Apply custom range
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {isFiltering && (
        <button
          onClick={() => onChange({ preset: "all" })}
          className="text-gray-400 hover:text-gray-700 p-1 rounded"
          aria-label="Clear date filter"
          data-testid="button-date-clear"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
