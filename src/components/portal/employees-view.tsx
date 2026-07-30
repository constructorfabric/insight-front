import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useViewer } from "@/auth";
import { CenteredSpinner } from "@/components/widgets/centered-spinner";
import { ComingSoon } from "@/components/widgets/coming-soon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePortalNavActions,
} from "@/lib/portal/portal-nav";
import { useIcPerson } from "@/queries/ic-dashboard";
import type { IdentityPerson } from "@/types/insight";
import { cn } from "@/lib/utils";

interface EmployeeRow {
  email: string;
  displayName: string;
  jobTitle: string;
  department: string;
  division: string;
  supervisorName: string;
  status: string;
}

/** Flatten the org tree (root + every descendant) into a de-duplicated roster. */
function collectEmployees(root: IdentityPerson): EmployeeRow[] {
  const byEmail = new Map<string, EmployeeRow>();
  const walk = (node: IdentityPerson) => {
    if (node.email) {
      const key = node.email.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, {
          email: node.email,
          displayName: node.display_name || node.email,
          jobTitle: node.job_title ?? "",
          department: node.department ?? "",
          division: node.division ?? "",
          supervisorName: node.supervisor_name ?? "",
          status: node.status ?? "",
        });
      }
    }
    node.subordinates.forEach(walk);
  };
  walk(root);
  return [...byEmail.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

/**
 * Employees directory — every person in the viewer's org (flattened org tree),
 * searchable, each row linking into their Person view. Sourced entirely from
 * the identity profile tree (`getPerson` recurses), so no metric queries and no
 * new endpoint: it's a live people index, not a scaffold.
 */
export function EmployeesView() {
  const { setZone } = usePortalNavActions();
  const { email: viewerEmail } = useViewer();
  const { data, isPending, isError, refetch } = useIcPerson(viewerEmail ?? "");
  const [query, setQuery] = useState("");

  const employees = useMemo(
    () => (data ? collectEmployees(data) : []),
    [data],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.displayName, e.jobTitle, e.department, e.division, e.supervisorName]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [employees, query]);

  if (isPending) return <CenteredSpinner className="min-h-[60vh]" />;
  if (isError || !data)
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ComingSoon variant="card" state="error" onRetry={refetch} />
      </div>
    );

  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length}
            {filtered.length !== employees.length ? ` of ${employees.length}` : ""}{" "}
            people · live from the identity directory
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, title, department…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.email}>
                <TableCell>
                  <Link
                    to="/ic/$person/personal"
                    params={{ person: e.email }}
                    // Clear the pinned Manage zone so the route-driven Person
                    // zone takes over (same pattern as the rail).
                    onClick={() => setZone(null)}
                    className="font-medium hover:underline"
                  >
                    {e.displayName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {e.jobTitle || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {e.department || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {e.division || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {e.supervisorName || "—"}
                </TableCell>
                <TableCell>
                  {e.status ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-medium",
                        e.status.toLowerCase() === "active"
                          ? "bg-success/15 text-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {e.status}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
