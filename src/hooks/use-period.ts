import { useSyncExternalStore } from "react";

import {
  resolveDateRange,
  type DateRange,
  validateDateRange,
} from "@/api/period-to-date-range";
import type { CustomRange, PeriodValue, ViewMode } from "@/types/insight";

const PERIOD_KEY = "insight.period";
const VIEW_MODE_KEY = "insight.view-mode";

const VALID_PERIODS: ReadonlySet<PeriodValue> = new Set([
  "week",
  "month",
  "quarter",
  "year",
]);
const VALID_VIEW_MODES: ReadonlySet<ViewMode> = new Set(["chart", "tile"]);

type PersistedState = {
  period: PeriodValue;
  customRange: CustomRange | null;
  viewMode: ViewMode;
};

const DEFAULT_STATE: PersistedState = {
  period: "month",
  customRange: null,
  viewMode: "chart",
};

function readPeriod(): PeriodValue {
  if (typeof window === "undefined") return DEFAULT_STATE.period;
  const raw = window.localStorage.getItem(PERIOD_KEY);
  if (raw && VALID_PERIODS.has(raw as PeriodValue)) {
    return raw as PeriodValue;
  }
  return DEFAULT_STATE.period;
}

function readCustomRange(): CustomRange | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${PERIOD_KEY}.custom`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "from" in parsed &&
      "to" in parsed &&
      typeof parsed.from === "string" &&
      typeof parsed.to === "string"
    ) {
      const range = { from: parsed.from, to: parsed.to };
      if (validateDateRange(range).valid) return range;
    }
  } catch {
    return null;
  }
  return null;
}

function readViewMode(): ViewMode {
  if (typeof window === "undefined") return DEFAULT_STATE.viewMode;
  const raw = window.localStorage.getItem(VIEW_MODE_KEY);
  if (raw && VALID_VIEW_MODES.has(raw as ViewMode)) {
    return raw as ViewMode;
  }
  return DEFAULT_STATE.viewMode;
}

let state: PersistedState = {
  period: readPeriod(),
  customRange: readCustomRange(),
  viewMode: readViewMode(),
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setState(next: Partial<PersistedState>): void {
  state = { ...state, ...next };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PERIOD_KEY, state.period);
      if (state.customRange) {
        window.localStorage.setItem(
          `${PERIOD_KEY}.custom`,
          JSON.stringify(state.customRange)
        );
      } else {
        window.localStorage.removeItem(`${PERIOD_KEY}.custom`);
      }
      window.localStorage.setItem(VIEW_MODE_KEY, state.viewMode);
    } catch {
      // localStorage may be unavailable (private mode, quota exceeded).
      // The in-memory state already mutated, so persistence is best-effort.
    }
  }
  notify();
}

function getSnapshot(): PersistedState {
  return state;
}

export function currentPeriod(): PeriodValue {
  return state.period;
}

export function currentCustomRange(): CustomRange | null {
  return state.customRange;
}

export function currentDateRange(): DateRange {
  return resolveDateRange(state.period, state.customRange);
}

export function currentViewMode(): ViewMode {
  return state.viewMode;
}

export function usePeriod(): {
  period: PeriodValue;
  customRange: CustomRange | null;
  dateRange: DateRange;
  setPeriod: (period: PeriodValue) => void;
  setCustomRange: (range: CustomRange | null) => void;
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    period: snap.period,
    customRange: snap.customRange,
    dateRange: resolveDateRange(snap.period, snap.customRange),
    setPeriod: (period) => setState({ period, customRange: null }),
    setCustomRange: (customRange) => {
      if (customRange && !validateDateRange(customRange).valid) {
        throw new Error(
          `Invalid date range: from=${customRange.from} to=${customRange.to}`
        );
      }
      setState({ customRange });
    },
  };
}

export function useViewMode(): {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    viewMode: snap.viewMode,
    setViewMode: (viewMode) => setState({ viewMode }),
  };
}
