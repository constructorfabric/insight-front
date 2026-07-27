import { useEffect, useRef } from "react";

import { EmployeesView } from "@/components/portal/employees-view";
import { TeamStateView } from "@/components/portal/team-state-view";
import { ComingSoon } from "@/components/widgets/coming-soon";
import { setPortalScope } from "@/lib/portal/portal-store";

/**
 * People zone content, driven by the selected pane item. The roster is a
 * lead-facing team-state dashboard (state → attention → member scan); the
 * individual view lives in the dedicated Person rail zone (drill into any
 * name), not here. Median-by-Role is an honest scaffold pending the cohort
 * pipeline; Employees is a live identity directory.
 *
 * The People route is the one place where a route still *sets* the org scope:
 * landing on /ic/<email>/team (a link, a drill, or a pasted URL) makes that
 * node the visible scope, after which every org zone reads it from the store.
 */
export function PeopleView({
  person,
  item,
}: {
  person: string;
  item: string | null;
}) {
  // Sync route → scope once per person, not on every render: the effect must
  // not fight a scope the user then changes from the topbar.
  const lastSynced = useRef<string | null>(null);
  useEffect(() => {
    if (person && lastSynced.current !== person) {
      lastSynced.current = person;
      setPortalScope({ root: person });
    }
  }, [person]);

  if (item === "median-by-role") {
    return (
      <Pending label="Cohort role medians — pending the two-axis cohort pipeline" />
    );
  }
  if (item === "employees") {
    return <EmployeesView />;
  }
  // Default (roster): the team-state dashboard over the active org scope.
  return <TeamStateView />;
}

function Pending({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-md p-8">
      <ComingSoon variant="card" state="empty" label={label} />
    </div>
  );
}
