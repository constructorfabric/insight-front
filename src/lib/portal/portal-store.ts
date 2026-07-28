import { useSyncExternalStore } from "react";

/**
 * Portal shell state (Phase 1, feature-flagged behind `insight.portal`).
 *
 * `enabled` persists to localStorage (mirrors the metrics-v2 flag pattern in
 * feature-flags.ts). `zone` is in-memory navigation state: `null` means "follow
 * the route" (the entity lenses — Person / People — render the existing
 * dashboard `<Outlet/>`); a zone id means an org-level lens is selected and the
 * content area shows its scaffold.
 */

/**
 * Org scope — WHO is counted in every org zone (design §6). `root` is the
 * email of a manager node inside the viewer's subtree (null = the viewer's
 * whole org); `directOnly` narrows to direct reports. Phase 2 reserves
 * `attrFilter` (attribute-value cut across the tree) — no UI yet.
 */
export interface OrgScope {
  root: string | null;
  directOnly: boolean;
  attrFilter?: { key: string; value: string };
}

const ENABLED_KEY = "insight.portal";
const SHOW_PLANNED_KEY = "insight.portal.showPlanned";

interface PortalState {
  enabled: boolean;
  zone: string | null;
  /** Selected section item within a theme/manage zone. */
  item: string | null;
  /** Expanded direction + active lens within the Directions zone. */
  dir: string;
  lens: string;
  /**
   * Active slice — the person-attribute that groups rosters and defines peer
   * cohorts everywhere. Empty string = the whole roster as one cohort (default,
   * no grouping). A key like "division"/"title" groups + compares within it.
   */
  slice: string;
  scope: OrgScope;
  /**
   * Whether navigation shows entries we have not built yet (`unbuilt` in the
   * nav model). Default ON while the whole portal is itself a preview: for us
   * and for demos the dead entries ARE the roadmap. Turn it off — or flip the
   * default — the day the portal stops being opt-in, so a customer never has
   * to tell our backlog apart from their own missing data.
   */
  showPlanned: boolean;
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_KEY) === "true";
}

/** Absent key = default ON (see `showPlanned`); only an explicit "false" hides. */
function readShowPlanned(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SHOW_PLANNED_KEY) !== "false";
}

let state: PortalState = {
  enabled: readEnabled(),
  showPlanned: readShowPlanned(),
  // `null` = follow the route (Person/People). The initial landing is pinned
  // once by PortalLayout based on whether the viewer manages anyone: a manager
  // lands on the Overview org rollup, an IC stays route-driven on their own
  // Person page (their subtree is empty, so org zones are meaningless).
  zone: null,
  item: null,
  dir: "dev",
  lens: "Delivery",
  slice: "",
  scope: { root: null, directOnly: false },
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function persist(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable — in-memory state still updated.
  }
}

export function setPortalEnabled(enabled: boolean): void {
  state = { ...state, enabled };
  persist(ENABLED_KEY, enabled ? "true" : "false");
  emit();
}

export function setPortalShowPlanned(show: boolean): void {
  state = { ...state, showPlanned: show };
  persist(SHOW_PLANNED_KEY, show ? "true" : "false");
  emit();
}

export function setPortalZone(zone: string | null): void {
  state = { ...state, zone };
  emit();
}

export function setPortalItem(item: string | null): void {
  state = { ...state, item };
  emit();
}

export function setPortalDir(dir: string): void {
  state = { ...state, dir };
  emit();
}

export function setPortalLens(lens: string): void {
  state = { ...state, lens };
  emit();
}

export function setPortalSlice(slice: string): void {
  state = { ...state, slice };
  emit();
}

/**
 * Patch the org scope. `root` is normalised to lowercase — route params and
 * identity-tree emails differ in casing, and `findIdentityNode` is
 * case-insensitive, so without this the same node written two ways looks like a
 * change. No-op patches bail before `emit()`, so a route→scope sync effect can
 * never bounce against a subscriber that re-renders and writes back.
 */
export function setPortalScope(patch: Partial<OrgScope>): void {
  const next: OrgScope = { ...state.scope, ...patch };
  if ("root" in patch) next.root = patch.root?.toLowerCase() ?? null;
  const prev = state.scope;
  if (
    next.root === prev.root &&
    next.directOnly === prev.directOnly &&
    next.attrFilter === prev.attrFilter
  ) {
    return;
  }
  state = { ...state, scope: next };
  emit();
}

export function usePortalEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.enabled,
    () => false,
  );
}

export function usePortalShowPlanned(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.showPlanned,
    () => true,
  );
}

export function usePortalZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => state.zone,
    () => null,
  );
}

export function usePortalItem(): string | null {
  return useSyncExternalStore(subscribe, () => state.item, () => null);
}

export function usePortalDir(): string {
  return useSyncExternalStore(subscribe, () => state.dir, () => "dev");
}

export function usePortalLens(): string {
  return useSyncExternalStore(subscribe, () => state.lens, () => "Delivery");
}

export function usePortalSlice(): string {
  return useSyncExternalStore(subscribe, () => state.slice, () => "");
}

const DEFAULT_SCOPE: OrgScope = { root: null, directOnly: false };

export function usePortalScope(): OrgScope {
  return useSyncExternalStore(subscribe, () => state.scope, () => DEFAULT_SCOPE);
}
