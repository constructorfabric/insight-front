import { Info } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SidebarTrigger } from "@/components/ui/sidebar";

const IMPROVEMENT_KEYS = [
  "direct_reports_toggle",
  "member_expand_full_metrics",
  "bitbucket_prs",
  "consistent_git_metrics",
  "readable_git_charts",
  "jira_task_delivery",
  "zoom_data",
  "ai_adoption_graphs",
  "claude_code_cost",
] as const;

const GAP_KEYS = ["identity", "gitlab_loc", "jira_kpis"] as const;

const COMING_KEYS = ["metrics_engine", "people_matching"] as const;

// Translations carry <strong>/<i> emphasis; restore foreground weight inside
// muted copy so the emphasized fragments read as in the source notes.
const EMPHASIS =
  "[&_strong]:font-semibold [&_strong]:text-foreground [&_i]:italic";

export function WhatsNewScreen() {
  const { t } = useTranslation();

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold tracking-tight">
          {t("whats_new.nav_label")}
        </h1>
      </header>

      <main className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-12">
          <section>
            <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              {t("whats_new.eyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance">
              {t("whats_new.title")}
            </h2>
            <p
              className={`mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground ${EMPHASIS}`}
            >
              <Trans i18nKey="whats_new.lead_html" />
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">
                  {t("whats_new.stamp.highlights_label")}
                </span>{" "}
                {t("whats_new.stamp.highlights")}
              </span>
              <span>
                <span className="font-semibold text-foreground">
                  {t("whats_new.stamp.focus_label")}
                </span>{" "}
                {t("whats_new.stamp.focus")}
              </span>
            </div>
          </section>

          <p
            className={`rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground ${EMPHASIS}`}
          >
            <Trans i18nKey="whats_new.in_short_html" />
          </p>

          <section>
            <h3 className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              {t("whats_new.improvements_label")}
            </h3>
            <div className="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
              {IMPROVEMENT_KEYS.map((key) => (
                <article
                  key={key}
                  className="grid gap-x-5 gap-y-1.5 p-4 sm:grid-cols-[10rem_1fr] sm:p-5"
                >
                  <p className="pt-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`whats_new.items.${key}.category`)}
                  </p>
                  <div>
                    <h4 className="text-base leading-snug font-semibold">
                      {t(`whats_new.items.${key}.title`)}
                    </h4>
                    <p
                      className={`mt-1 text-sm leading-relaxed text-muted-foreground ${EMPHASIS}`}
                    >
                      <Trans
                        i18nKey={`whats_new.items.${key}.description_html`}
                      />
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <Alert>
            <Info />
            <AlertTitle>{t("whats_new.gaps.title")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4 text-start">
                {GAP_KEYS.map((key) => (
                  <li key={key} className={EMPHASIS}>
                    <Trans i18nKey={`whats_new.gaps.items.${key}`} />
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>

          <section>
            <h3 className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              {t("whats_new.coming.label")}
            </h3>
            <div className="mt-3 flex flex-col gap-2.5">
              {COMING_KEYS.map((key) => (
                <article
                  key={key}
                  className="grid gap-x-5 gap-y-1 rounded-lg border bg-muted/40 px-4 py-3.5 sm:grid-cols-[10rem_1fr]"
                >
                  <p className="pt-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`whats_new.coming.items.${key}.category`)}
                  </p>
                  <div>
                    <h4 className="text-sm font-semibold">
                      {t(`whats_new.coming.items.${key}.title`)}
                    </h4>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      {t(`whats_new.coming.items.${key}.description`)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <footer className="border-t pt-4 font-mono text-xs text-muted-foreground">
            {t("whats_new.footer")}
          </footer>
        </div>
      </main>
    </>
  );
}
