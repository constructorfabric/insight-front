import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { getPersonByEmail } from "@/api/identity-client";
import { FullScreenLoading } from "@/components/full-screen-loading";

export interface LegacyPersonRedirectProps {
  /** The `$person` route param when it is not a person id (a legacy email). */
  email: string;
  view: "personal" | "team";
}

/**
 * Migrates a pre-cutover `/ic/<email>/…` URL onto its canonical
 * `/ic/<person-id>/…` form: shared links and bookmarks stay valid, and the
 * dashboard never sends an email to the metrics API (a 400 the user cannot
 * act on). An email identity cannot resolve — the person is gone, renamed, or
 * outside the viewer's visible set — lands on the viewer's own dashboard,
 * which is the same place an unauthorized link has always led.
 */
export function LegacyPersonRedirect({ email, view }: LegacyPersonRedirectProps) {
  const navigate = useNavigate();
  const person = useQuery({
    queryKey: ["identity", "person-by-email", email.trim().toLowerCase()],
    queryFn: () => getPersonByEmail(email),
    retry: false,
  });

  const personId = person.data?.person_id;
  useEffect(() => {
    if (personId) {
      void navigate({
        to: view === "team" ? "/ic/$person/team" : "/ic/$person/personal",
        params: { person: personId },
        replace: true,
      });
      return;
    }
    if (person.isError) {
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, person.isError, personId, view]);

  return <FullScreenLoading />;
}
