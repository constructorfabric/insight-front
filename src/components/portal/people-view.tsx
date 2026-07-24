import { EmployeesView } from "@/components/portal/employees-view";
import { TeamStateView } from "@/components/portal/team-state-view";
import { ComingSoon } from "@/components/widgets/coming-soon";

/**
 * People zone content, driven by the selected pane item. The roster is a
 * lead-facing team-state dashboard (state → attention → member scan); the
 * individual view lives in the dedicated Person rail zone (drill into any
 * name), not here. Median-by-Role is an honest scaffold pending the cohort
 * pipeline; Employees is a live identity directory.
 */
export function PeopleView({
  person,
  item,
}: {
  person: string;
  item: string | null;
}) {
  if (item === "median-by-role") {
    return (
      <Pending label="Cohort role medians — pending the two-axis cohort pipeline" />
    );
  }
  if (item === "employees") {
    return <EmployeesView />;
  }
  // Default (roster): the team-state dashboard scoped to the active node.
  return <TeamStateView scopePerson={person} />;
}

function Pending({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-md p-8">
      <ComingSoon variant="card" state="empty" label={label} />
    </div>
  );
}
