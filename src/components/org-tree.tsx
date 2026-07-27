import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, User, Users } from "lucide-react";
import { useMemo } from "react";

import { useViewer } from "@/auth";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { setPortalScope } from "@/lib/portal/portal-store";
import { useIcPerson } from "@/queries/ic-dashboard";
import type { IdentityPerson } from "@/types/insight";

function emailEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function containsEmail(node: IdentityPerson, email: string): boolean {
  if (emailEq(node.email, email)) return true;
  return node.subordinates.some((s) => containsEmail(s, email));
}

function PersonNode({
  node,
  depth,
  activeEmail,
  leadsToTeam,
}: {
  node: IdentityPerson;
  depth: number;
  activeEmail: string | null;
  /** Lead (has reports) links to their team roster instead of their own page. */
  leadsToTeam: boolean;
}) {
  const hasReports = node.subordinates.length > 0;
  const isActive = activeEmail ? emailEq(activeEmail, node.email) : false;
  const hasActiveDescendant =
    hasReports && activeEmail
      ? node.subordinates.some((s) => containsEmail(s, activeEmail))
      : false;
  const open = depth === 0 || isActive || hasActiveDescendant;
  // A lead's name lands on their team; an IC's on their own page. (The two
  // literal `to`s keep the typed router happy vs. a computed path.) Drilling
  // into a lead also *sets the org scope* (design §6) so the topbar badge and
  // every org zone follow the node you just clicked.
  const link =
    hasReports && leadsToTeam ? (
      <Link
        to="/ic/$person/team"
        params={{ person: node.email }}
        onClick={() => setPortalScope({ root: node.email })}
      />
    ) : (
      <Link to="/ic/$person/personal" params={{ person: node.email }} />
    );
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={isActive}
          render={link}
          style={{ paddingLeft: `${0.5 + depth * 0.875}rem` }}
        >
          {hasReports ? (
            open ? (
              <ChevronDown />
            ) : (
              <ChevronRight />
            )
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {hasReports ? <Users /> : <User />}
          <span className="truncate">{node.display_name || node.email}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {hasReports && open
        ? node.subordinates.map((sub) => (
            <PersonNode
              key={sub.email}
              node={sub}
              depth={depth + 1}
              activeEmail={activeEmail}
              leadsToTeam={leadsToTeam}
            />
          ))
        : null}
    </>
  );
}

/**
 * Recursive org-chart navigation, rooted at the viewer. Extracted from
 * AppSidebar so the portal shell's context pane can reuse the same tree
 * without duplicating the traversal / active-node logic.
 */
export function OrgTree({ leadsToTeam = false }: { leadsToTeam?: boolean } = {}) {
  const { email: viewerEmail } = useViewer();
  const viewerQ = useIcPerson(viewerEmail ?? "");
  const viewer = viewerQ.data ?? null;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeEmail = useMemo(() => {
    const m = /^\/ic\/([^/]+)/.exec(pathname);
    if (m) return decodeURIComponent(m[1]!);
    if (pathname === "/" && viewerEmail) return viewerEmail;
    return null;
  }, [pathname, viewerEmail]);

  if (!viewer) return null;

  return (
    <SidebarMenu>
      <PersonNode
        node={viewer}
        depth={0}
        activeEmail={activeEmail}
        leadsToTeam={leadsToTeam}
      />
    </SidebarMenu>
  );
}
