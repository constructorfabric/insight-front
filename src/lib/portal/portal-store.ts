import { useSyncExternalStore } from "react";

/**
 * Portal PREFERENCES (feature-flagged behind `insight.portal`).
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
  /**
   * Whether navigation shows entries we have not built yet (`unbuilt` in the
   * nav model). Default ON while the whole portal is itself a preview: for us
   * and for demos the dead entries ARE the roadmap. Turn it off — or flip the
   * default — the day the portal stops being opt-in, so a customer never has
   * to tell our backlog apart from their own missing data.
   */
  showPlanned: boolean;
}

/** Router-safe read: `beforeLoad` runs outside React, so it cannot use a hook. */
export function readPortalEnabled(): boolean {
  return readEnabled();
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
