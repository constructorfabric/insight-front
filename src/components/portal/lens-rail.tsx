import { useNavigate } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";

import { AppSidebarFooter } from "@/components/app-sidebar-footer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ROLES, ZONES, type Zone } from "@/lib/portal/nav-model";
import {
  setPortalRole,
  setPortalZone,
  usePortalRole,
  type PortalRole,
} from "@/lib/portal/portal-store";
import { useActiveZone } from "@/lib/portal/use-active-zone";
import { useViewerIsManager } from "@/lib/portal/use-viewer-is-manager";

/**
 * Zones that still make sense when the viewer manages no one — everything else
 * rolls up a (non-existent) subtree. An IC's portal collapses to these.
 */
const IC_ZONES = new Set(["person"]);

/**
 * Portal primary rail: a bounded set of zone icons. Entity zones (Person /
 * People) link to the existing dashboard routes and clear the theme-zone
 * selection; other zones set the active zone so the context pane switches.
 * Zones the active role can't see are filtered out (permission layer — FE
 * stub over the future role_section_visibility entity). Rendered as a
 * `collapsible="none"` sidebar so it sits in normal flow beside the pane.
 */
export function LensRail() {
  const role = usePortalRole();
  const navigate = useNavigate();
  const { activeZone, activePerson } = useActiveZone();
  const { isManager, isPending: mgrPending } = useViewerIsManager();
  const permitted = new Set(ROLES[role].zones);
  // An IC (no reports) has no subtree to roll up, so org zones are hidden — the
  // shell collapses to Person. While the viewer's identity is still resolving,
  // assume manager so the rail doesn't flash a collapsed state.
  const orgZonesVisible = isManager || mgrPending;

  // Person / People are route-driven: clicking them navigates to the person's
  // route and clears the pinned zone so `useActiveZone` follows the path
  // (/personal → person, /team → people). This is what lets a person-name
  // click inside a roster or the WorkChart drill straight into Person, and the
  // Person header's "team" affordance climb back to People — no pinned zone
  // gets in the way. Theme / directions / manage zones aren't route-backed, so
  // they still pin the zone.
  function selectZone(zone: Zone) {
    if (zone.kind === "person") {
      setPortalZone(null);
      if (activePerson)
        void navigate({ to: "/ic/$person/personal", params: { person: activePerson } });
    } else if (zone.kind === "people") {
      setPortalZone(null);
      if (activePerson)
        void navigate({ to: "/ic/$person/team", params: { person: activePerson } });
    } else {
      setPortalZone(zone.id);
    }
  }

  return (
    <Sidebar collapsible="none" className="w-14! border-e">
      <SidebarHeader className="items-center">
        <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          I
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="items-center gap-1">
          {ZONES.filter(
            (z) => permitted.has(z.id) && (orgZonesVisible || IC_ZONES.has(z.id)),
          ).map((z) => (
            <ZoneItem
              key={z.id}
              zone={z}
              active={activeZone === z.id}
              onSelect={selectZone}
            />
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="items-center gap-1">
        <label className="sr-only" htmlFor="portal-role">
          View as role
        </label>
        <select
          id="portal-role"
          value={role}
          onChange={(e) => setPortalRole(e.target.value as PortalRole)}
          title="View as role (RBAC preview)"
          className="w-11 rounded-md bg-sidebar-accent py-1 text-center text-[10px] font-semibold text-sidebar-foreground ring-sidebar-ring outline-hidden focus-visible:ring-2"
        >
          <option value="exec">Exec</option>
          <option value="em">EM</option>
          <option value="backend">Dev</option>
          <option value="sales">Sales</option>
          <option value="support">Supp</option>
        </select>
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                title="Settings"
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Settings2 className="size-[19px]" aria-hidden />
                <span className="sr-only">Settings</span>
              </button>
            }
          />
          <PopoverContent side="right" align="end" className="w-56 gap-0 p-1">
            <AppSidebarFooter />
          </PopoverContent>
        </Popover>
      </SidebarFooter>
    </Sidebar>
  );
}

function ZoneItem({
  zone,
  active,
  onSelect,
}: {
  zone: Zone;
  active: boolean;
  onSelect: (zone: Zone) => void;
}) {
  const Icon = zone.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        title={zone.label}
        className="size-10 justify-center p-0"
        onClick={() => onSelect(zone)}
      >
        <Icon />
        <span className="sr-only">{zone.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
