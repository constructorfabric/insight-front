import { useNavigate } from "@tanstack/react-router";

import { ZONES, type Zone } from "@/lib/portal/nav-model";
import {
  usePortalShowPlanned,
} from "@/lib/portal/portal-store";
import {
  usePortalNavActions,
} from "@/lib/portal/portal-nav";
import { useActiveZone } from "@/lib/portal/use-active-zone";
import { useViewerIsManager } from "@/lib/portal/use-viewer-is-manager";

/**
 * Zones that still make sense when the viewer manages no one — everything else
 * rolls up a (non-existent) subtree. An IC's portal collapses to these.
 */
const IC_ZONES = new Set(["person"]);

/**
 * The zone list the viewer may see plus the selection behaviour, shared by the
 * desktop icon rail and the mobile drawer so both offer exactly the same zones
 * and route the same way. Two zones are route-driven (Person / People): they
 * navigate and clear the pinned zone, which is what lets a person-name click
 * inside a roster drill straight into Person; the rest pin the zone.
 */
export function useZoneNav(): {
  zones: Zone[];
  activeZone: string;
  selectZone: (zone: Zone) => void;
} {
  const { setItem, setZone } = usePortalNavActions();
  const navigate = useNavigate();
  const { activeZone, activePerson } = useActiveZone();
  const { isManager, isPending: mgrPending } = useViewerIsManager();
  // Zones we have not built are hidden unless the viewer opted into seeing
  // planned work — a rail of scaffolds makes the built zones look unreliable.
  const showPlanned = usePortalShowPlanned();
  // An IC (no reports) has no subtree to roll up, so org zones are hidden — the
  // shell collapses to Person. While the viewer's identity is still resolving,
  // assume manager so the nav doesn't flash a collapsed state.
  const orgZonesVisible = isManager || mgrPending;

  const zones = ZONES.filter(
    (z) =>
      (orgZonesVisible || IC_ZONES.has(z.id)) &&
      (z.readiness !== "unbuilt" || showPlanned),
  );

  function selectZone(zone: Zone) {
    // `portal.item` is a per-zone selection; carrying it across zones makes
    // the target view render a fallback while the pane highlights nothing.
    if (activeZone !== zone.id) setItem(null);
    if (zone.kind === "person") {
      setZone(null);
      if (activePerson)
        void navigate({ to: "/ic/$person/personal", params: { person: activePerson } });
    } else if (zone.kind === "people") {
      setZone(null);
      if (activePerson)
        void navigate({ to: "/ic/$person/team", params: { person: activePerson } });
    } else {
      setZone(zone.id);
    }
  }

  return { zones, activeZone, selectZone };
}
