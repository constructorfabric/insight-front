import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, ChevronUp, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIcPerson } from "@/queries/ic-dashboard";
import { setPortalZone } from "@/lib/portal/portal-store";
import { cn } from "@/lib/utils";

/**
 * Person-zone header — the "climb up" + lateral half of the Person ↔ People
 * model. The name is a peer switcher: it lists the person's teammates (their
 * manager's direct reports) so you can hop between people without bouncing back
 * to People. The supervisor chip drills sideways into the manager; "Team" jumps
 * to People — scoped to the person's own reports if they're a manager, else to
 * their manager's team. Everything is route-driven (clears the pinned zone) and
 * sourced from the identity profile; absent fields render nothing.
 */
export function PersonHeader({ person }: { person: string }) {
  const navigate = useNavigate();
  const { data } = useIcPerson(person);
  const supervisorEmail = data?.supervisor_email ?? data?.parent_email ?? null;
  // Fetch the manager to enumerate siblings; the query self-disables on "".
  const { data: manager } = useIcPerson(supervisorEmail ?? "");

  if (!data) return null;

  const subtitle = [data.job_title, data.department]
    .filter((s) => s && s.trim())
    .join(" · ");
  const supervisorName = data.supervisor_name ?? null;
  const isManager = data.subordinates.length > 0;
  // Manager → their own team; IC → their manager's team (peers).
  const teamTarget = isManager ? data.email : supervisorEmail;

  const peers = [...(manager?.subordinates ?? [])]
    .filter((p) => p.email)
    .sort((a, b) =>
      (a.display_name || a.email).localeCompare(b.display_name || b.email),
    );
  const hasPeers = peers.length > 1;

  function goPerson(email: string) {
    setPortalZone(null);
    void navigate({ to: "/ic/$person/personal", params: { person: email } });
  }
  function goTeam(email: string) {
    setPortalZone(null);
    void navigate({ to: "/ic/$person/team", params: { person: email } });
  }

  const title = (
    <h1 className="truncate text-lg font-semibold tracking-tight">
      {data.display_name || data.email}
    </h1>
  );

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 md:px-6">
      <div className="flex min-w-0 flex-col">
        {hasPeers ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1 rounded-md text-left hover:opacity-80"
                  title="Switch teammate"
                >
                  {title}
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent
              align="start"
              className="max-h-80 w-64 overflow-y-auto"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {supervisorName ? `${supervisorName}'s team` : "Team"}
                </DropdownMenuLabel>
                {peers.map((p) => {
                  const active =
                    p.email.toLowerCase() === data.email.toLowerCase();
                  return (
                    <DropdownMenuItem
                      key={p.email}
                      onClick={() => goPerson(p.email)}
                      className={cn(active && "font-medium")}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">
                        {p.display_name || p.email}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          title
        )}
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {supervisorEmail && supervisorName ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-muted-foreground"
            onClick={() => goPerson(supervisorEmail)}
          >
            <ChevronUp className="size-3.5" />
            <span className="max-w-40 truncate">{supervisorName}</span>
          </Button>
        ) : null}
        {teamTarget ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => goTeam(teamTarget)}
          >
            <Users className="size-3.5" />
            {isManager ? "Team" : "Peers"}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
