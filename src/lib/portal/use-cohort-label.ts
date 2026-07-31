import { useMemo } from "react";

import { useViewer } from "@/auth";
import { availableSlices, collectRosterAttrs } from "@/lib/insight/slices";
import { normalizePersonId } from "@/lib/metrics/entity";
import { usePortalSlice } from "@/lib/portal/portal-nav";
import { useIcPerson } from "@/queries/ic-dashboard";

/**
 * The noun a peer comparison should use: the active slice's own label, or
 * "team" when the roster is one undivided cohort.
 *
 * It exists because three surfaces hardcoded a label while injecting peer stats
 * from whatever cohort the slice defined — so with slice=Manager the UI read
 * "vs department median" over manager-cohort numbers. A comparison that names
 * the wrong pool is worse than one that names none: the reader draws a
 * conclusion about the wrong group of people.
 *
 * Derived from the viewer's whole org, like the slice control itself, so every
 * surface says the same thing about the same slice.
 */
export function useCohortLabel(): string {
  const slice = usePortalSlice();
  const { email } = useViewer();
  const tree = useIcPerson(email ?? "").data ?? null;
  const dims = useMemo(
    () => availableSlices(collectRosterAttrs(tree, normalizePersonId).values()),
    [tree],
  );
  if (!slice) return "team";
  return (dims.find((d) => d.key === slice)?.label ?? "cohort").toLowerCase();
}
