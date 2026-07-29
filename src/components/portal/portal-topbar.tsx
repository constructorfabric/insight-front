import { useMemo } from "react";

import { useViewer } from "@/auth";
import { ScopeSelect } from "@/components/portal/scope-select";
import { SliceSelect } from "@/components/portal/slice-select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { PeriodSelectorBar } from "@/components/widgets/period-selector-bar";
import { usePeriod } from "@/hooks/use-period";
import { availableSlices } from "@/lib/insight/slices";
import { collectRosterAttrs } from "@/lib/insight/slices";
import { normalizePersonId } from "@/lib/metrics/entity";
import { useIcPerson } from "@/queries/ic-dashboard";

/**
 * Global portal bar — the two cross-cutting controls live here so every zone
 * shares one consistent position: the **period** filter and the **slice**
 * (grouping + peer cohort). Both back global state (usePeriod / portal.slice),
 * so all views react. Slice dimensions are derived once from the viewer's whole
 * org (attributes are org-wide, not per-view), keeping the control universal.
 */
export function PortalTopBar() {
  const { period, customRange, setPeriod, setCustomRange } = usePeriod();
  const { email } = useViewer();
  const tree = useIcPerson(email ?? "").data ?? null;
  const dims = useMemo(
    () => availableSlices(collectRosterAttrs(tree, normalizePersonId).values()),
    [tree],
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-2 md:px-6">
      {/* Opens the context pane wherever it is collapsed — the drawer is the
          only way to reach navigation on a phone (no rail at all), and the only
          way to reach sections on a tablet. */}
      <SidebarTrigger className="me-auto lg:hidden" />
      <ScopeSelect />
      <SliceSelect dims={dims} />
      <PeriodSelectorBar
        period={period}
        customRange={customRange}
        onPeriodChange={setPeriod}
        onRangeChange={setCustomRange}
      />
    </div>
  );
}
