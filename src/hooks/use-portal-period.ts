import {
  resolveDateRange,
  validateDateRange,
  type DateRange,
} from "@/api/period-to-date-range";
import { usePortalSearch, useSetPortalSearch } from "@/lib/portal/portal-search";
import { readPeriodPreference, writePeriodPreference } from "@/hooks/use-period";
import type { CustomRange, PeriodValue } from "@/types/insight";

/**
 * The period, read from the URL.
 *
 * A link has to reproduce the whole picture, and the period is half of any
 * number on screen — "63 commits" means nothing without the window it covers.
 * So `?period=` (plus `?from=`/`?to=` for a custom range) is the truth, and
 * localStorage keeps only the DEFAULT for a URL that names none: a reader's
 * habitual window survives between sessions without leaking into a link they
 * send someone else.
 */
export function usePortalPeriod(): {
  period: PeriodValue;
  customRange: CustomRange | null;
  dateRange: DateRange;
  setPeriod: (period: PeriodValue) => void;
  setCustomRange: (range: CustomRange | null) => void;
} {
  const search = usePortalSearch();
  const setSearch = useSetPortalSearch();

  const period = search.period ?? readPeriodPreference();
  const customRange =
    search.from && search.to ? { from: search.from, to: search.to } : null;

  return {
    period,
    customRange,
    dateRange: resolveDateRange(period, customRange),
    setPeriod: (next) => {
      // Remember the choice as the default for a link that names no period,
      // then put it in the URL where it belongs.
      writePeriodPreference(next);
      setSearch({ period: next, from: undefined, to: undefined });
    },
    setCustomRange: (range) => {
      if (range && !validateDateRange(range).valid) {
        throw new Error(`Invalid date range: from=${range.from} to=${range.to}`);
      }
      setSearch({ from: range?.from, to: range?.to });
    },
  };
}
