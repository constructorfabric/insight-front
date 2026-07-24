import { ChevronRight, Layers, LayoutGrid } from "lucide-react";

import { OrgTree } from "@/components/org-tree";
import { metricGroups } from "@/lib/insight/groups";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  CONNECTOR_COLOR,
  DIRECTIONS,
  MANAGE_ITEMS,
  PEOPLE_ITEMS,
  ROLES,
  ZONE_SECTIONS,
  zoneById,
  type Direction,
  type PaneItem,
} from "@/lib/portal/nav-model";
import {
  setPortalDir,
  setPortalItem,
  setPortalLens,
  togglePortalMore,
  usePortalDir,
  usePortalItem,
  usePortalLens,
  usePortalMore,
  usePortalRole,
} from "@/lib/portal/portal-store";
import { useActiveZone } from "@/lib/portal/use-active-zone";
import { cn } from "@/lib/utils";

const ZONE_SUB: Record<string, string> = {
  overview: "Cross-functional org rollup",
  directions: "Functional domains",
  person: "Pick a person",
  people: "Roster & org structure",
  aicost: "Adoption funnel & cost",
  scorecard: "Unit × quarter × QoQ",
  reports: "Generated & custom",
  manage: "Catalog, identity & governance",
};

const BADGE_TONE: Record<string, string> = {
  warn: "bg-warning/15 text-warning",
  new: "bg-primary/10 text-foreground",
  error: "bg-destructive/15 text-destructive",
};

/** Zone-contextual secondary navigation, driven by the active rail zone. */
export function ContextPane() {
  const { activeZone } = useActiveZone();
  const zone = zoneById(activeZone);
  const title = zone?.label ?? "Insight";

  return (
    <Sidebar collapsible="none" className="border-e">
      <SidebarHeader>
        <div className="flex flex-col px-2 py-1.5">
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            {title}
          </span>
          <span className="text-xs text-muted-foreground">
            {ZONE_SUB[activeZone] ?? ""}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {activeZone === "directions" ? (
          <DirectionsNav />
        ) : activeZone === "people" ? (
          <PeopleNav />
        ) : activeZone === "manage" ? (
          <ItemsNav items={MANAGE_ITEMS} groupLabel="Manage" />
        ) : activeZone === "person" ? (
          <PersonSectionsNav />
        ) : (
          <ThemeNav zoneId={activeZone} />
        )}
      </SidebarContent>
    </Sidebar>
  );
}

/* ── Theme zones (Overview / AI & Cost / Scorecard / Reports) ────────── */

function ThemeNav({ zoneId }: { zoneId: string }) {
  const groups = ZONE_SECTIONS[zoneId] ?? [];
  const active = usePortalItem();
  return (
    <>
      {groups.map((g, i) => (
        <SidebarGroup key={g.label ?? i}>
          {g.label ? <SidebarGroupLabel>{g.label}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {g.items.map((it) => (
                <ItemButton key={it.id} item={it} active={active === it.id} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function ItemsNav({
  items,
  groupLabel,
}: {
  items: readonly PaneItem[];
  groupLabel: string;
}) {
  const active = usePortalItem();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => (
            <ItemButton key={it.id} item={it} active={active === it.id} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ItemButton({ item, active }: { item: PaneItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={() => setPortalItem(item.id)}
      >
        <Icon />
        <span>{item.label}</span>
        {item.badge ? (
          <span
            className={cn(
              "ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
              BADGE_TONE[item.badge.tone],
            )}
          >
            {item.badge.text}
          </span>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/* ── Directions zone ─────────────────────────────────────────────────── */

function DirectionsNav() {
  const role = usePortalRole();
  const dirs = ROLES[role].dirs;
  const focus = new Set(ROLES[role].focus);
  const visible = DIRECTIONS.filter((d) => dirs.includes(d.id));
  const focusDirs = visible.filter((d) => focus.has(d.id));
  const lessDirs = visible.filter((d) => !focus.has(d.id));
  const moreOpen = usePortalMore();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        Directions
        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
          · catalog · {visible.length} of {DIRECTIONS.length}
        </span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {focusDirs.map((d) => (
            <DirectionItem key={d.id} direction={d} />
          ))}
        </SidebarMenu>

        {lessDirs.length ? (
          <>
            <button
              type="button"
              onClick={togglePortalMore}
              className="mt-2 flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
            >
              <ChevronRight
                className={cn("size-3 transition-transform", moreOpen && "rotate-90")}
              />
              Less relevant · {lessDirs.length}
            </button>
            {moreOpen ? (
              <SidebarMenu>
                {lessDirs.map((d) => (
                  <DirectionItem key={d.id} direction={d} />
                ))}
              </SidebarMenu>
            ) : null}
          </>
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function DirectionItem({ direction }: { direction: Direction }) {
  const activeDir = usePortalDir();
  const activeLens = usePortalLens();
  const expanded = activeDir === direction.id;
  const Icon = direction.icon;

  function toggle() {
    if (expanded) {
      setPortalDir("");
    } else {
      setPortalDir(direction.id);
      setPortalLens(direction.lenses[0]!);
    }
  }

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton isActive={expanded} onClick={toggle} aria-expanded={expanded}>
          <Icon />
          <span>{direction.name}</span>
          {direction.source === "bullet" ? (
            <span className="ml-auto rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold text-warning">
              bullet
            </span>
          ) : null}
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              direction.source === "bullet" ? "ml-1" : "ml-auto",
              expanded && "rotate-90",
            )}
          />
        </SidebarMenuButton>
      </SidebarMenuItem>

      {expanded ? (
        <>
          <div className="flex flex-wrap gap-1 px-3 pt-0.5 pb-1 pl-9">
            {direction.connectors.map((c) => (
              <span
                key={c}
                title={c}
                className="size-2 rounded-full"
                style={{ background: CONNECTOR_COLOR[c] ?? "var(--muted-foreground)" }}
              />
            ))}
          </div>
          <SidebarMenuSub>
            {direction.lenses.map((lens) => (
              <SidebarMenuSubItem key={lens}>
                <SidebarMenuSubButton
                  isActive={activeLens === lens}
                  onClick={() => {
                    setPortalLens(lens);
                    setPortalItem(null);
                  }}
                >
                  <span>{lens}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </>
      ) : null}
    </>
  );
}

/* ── People / Person zones ───────────────────────────────────────────── */

function PeopleNav() {
  const active = usePortalItem();
  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Views</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {PEOPLE_ITEMS.map((it) => (
              <ItemButton key={it.id} item={it} active={active === it.id} />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <WorkChart />
    </>
  );
}

function WorkChart() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>WorkChart</SidebarGroupLabel>
      <SidebarGroupContent>
        <OrgTree leadsToTeam />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/* ── Person zone: one person, section switcher (no WorkChart, no modal) ─── */

function PersonSectionsNav() {
  const active = usePortalItem();
  const groups = metricGroups();
  const groupIds = groups.map((g) => g.id) as string[];
  const glance = active == null || !groupIds.includes(active);
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Sections</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive={glance} onClick={() => setPortalItem(null)}>
              <LayoutGrid />
              <span>At a glance</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {groups.map((g) => (
            <SidebarMenuItem key={g.id}>
              <SidebarMenuButton
                isActive={active === g.id}
                onClick={() => setPortalItem(g.id)}
              >
                <Layers />
                <span>{g.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
