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
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_KEY) === "true";
}

let state: PortalState = {
  enabled: readEnabled(),
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

export function setPortalScope(patch: Partial<OrgScope>): void {
  state = { ...state, scope: { ...state.scope, ...patch } };
  emit();
}

export function usePortalEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.enabled,
    () => false,
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
