import { useSyncExternalStore } from "react";

import { authStore } from "./auth-store";
import type { AuthSnapshot } from "./types";

let redirecting = false;

/**
 * Sanitize a return-to into a site-relative path (mirrors the backend guard).
 * `/auth/*` paths collapse to `/` — a return-to pointing back into the login
 * flow would nest on every bounce and grow the URL without bound.
 */
function safeReturnTo(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path.startsWith("/auth/") || path === "/auth" ? "/" : path;
}

/**
 * Redirect the whole page into the login flow. The gateway + authenticator own
 * the OIDC dance; we only hand them a `return_to`. Guarded so multiple 401s in
 * flight don't stack redirects.
 */
export function signIn(returnTo?: string): void {
  if (redirecting) return;
  redirecting = true;
  const dest = safeReturnTo(returnTo ?? window.location.pathname + window.location.search);
  window.location.assign(`/auth/login?return_to=${encodeURIComponent(dest)}`);
}

/**
 * Revoke the session server-side, then follow the RP-initiated logout URL the
 * authenticator returns (or fall back to the app root).
 */
export async function signOut(): Promise<void> {
  let dest = "/";
  try {
    const res = await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as { rp_logout_url?: string | null };
    if (body.rp_logout_url) dest = body.rp_logout_url;
  } catch {
    // ignore — best-effort logout; still bounce the browser.
  }
  authStore.setUnauthenticated();
  window.location.assign(dest);
}

export type UseAuthResult = AuthSnapshot & {
  signIn: (returnTo?: string) => void;
  signOut: () => Promise<void>;
};

export function useAuth(): UseAuthResult {
  const snap = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getSnapshot,
  );
  return { ...snap, signIn, signOut };
}
