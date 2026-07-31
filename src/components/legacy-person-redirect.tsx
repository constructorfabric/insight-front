import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { getPersonByEmail, IdentityApiError } from "@/api/identity-client";
import { FullScreenLoading } from "@/components/full-screen-loading";

export interface LegacyPersonRedirectProps {
  /** The `$person` route param when it is not a person id (a legacy email). */
  email: string;
  view: "personal" | "team";
}

/** Whether identity said "nobody" — the one outcome this component absorbs. */
function isNotFound(error: unknown): boolean {
  return error instanceof IdentityApiError && error.status === 404;
}

/**
 * Migrates a pre-cutover `/ic/<email>/…` URL onto its canonical
 * `/ic/<person-id>/…` form: shared links and bookmarks stay valid, and the
 * dashboard never sends an email to the metrics API (a 400 the user cannot
 * act on).
 *
 * A 404 — the person is gone, renamed, or outside the viewer's visible set —
 * lands on the viewer's own dashboard, which is the same place an unauthorized
 * link has always led. Every OTHER failure (401, 5xx, network, malformed body)
 * reaches the error boundary instead: silently routing them to the root
 * dashboard would report a broken session or a down service as "no such
 * person".
 */
export function LegacyPersonRedirect({ email, view }: LegacyPersonRedirectProps) {
  const navigate = useNavigate();
  // One spelling for both the cache key and the wire: keying on the normalized
  // form while sending the raw one makes two requests share a cache entry when
  // the backend may well resolve them differently (it only trims; the rest is
  // the column's collation).
  const normalizedEmail = email.trim().toLowerCase();
  const person = useQuery({
    queryKey: ["identity", "person-by-email", normalizedEmail],
    queryFn: () => getPersonByEmail(normalizedEmail),
    retry: false,
    throwOnError: (error) => !isNotFound(error),
  });

  const personId = person.data?.person_id;
  const notFound = isNotFound(person.error);
  useEffect(() => {
    if (personId) {
      void navigate({
        to: view === "team" ? "/ic/$person/team" : "/ic/$person/personal",
        params: { person: personId },
        replace: true,
      });
      return;
    }
    if (notFound) {
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, notFound, personId, view]);

  return <FullScreenLoading />;
}
