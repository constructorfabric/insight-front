import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/use-auth";
import {
  EvidenceDialogContext,
  type EvidenceDialogState,
} from "@/components/metric-evidence-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

const MetricEvidenceDialog = lazy(() =>
  import("@/components/metric-evidence-dialog").then((module) => ({
    default: module.MetricEvidenceDialog,
  }))
);

export function MetricEvidenceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const tenantId = session?.tenantId ?? null;
  const queryClient = useQueryClient();
  const previousTenant = useRef(tenantId);
  const [state, setState] = useState<EvidenceDialogState | null>(null);
  useEffect(() => {
    if (previousTenant.current !== tenantId) {
      void queryClient.cancelQueries({ queryKey: ["metric-drilldown"] });
      queryClient.removeQueries({ queryKey: ["metric-drilldown"] });
      setState(null);
    }
    previousTenant.current = tenantId;
  }, [queryClient, tenantId]);
  const openEvidenceTargets = useCallback(
    (
      targets: readonly EvidenceDialogState["targets"][number][],
      title?: EvidenceDialogState["title"]
    ) => {
      const uniqueTargets = [
        ...new Map(
          targets.map((target) => [target.selection.metric_key, target])
        ).values(),
      ];
      const first = uniqueTargets[0];
      if (!first) return;
      setState({
        targets: [first, ...uniqueTargets.slice(1)],
        activeMetricKey: first.selection.metric_key,
        title,
      });
    },
    []
  );
  const openEvidence = useCallback(
    (
      selection: EvidenceDialogState["targets"][number]["selection"],
      label: string
    ) => openEvidenceTargets([{ selection, label }]),
    [openEvidenceTargets]
  );
  const selectEvidenceMetric = useCallback((metricKey: string) => {
    setState((current) =>
      current?.targets.some(
        (target) => target.selection.metric_key === metricKey
      )
        ? { ...current, activeMetricKey: metricKey }
        : current
    );
  }, []);
  const value = useMemo(
    () => ({ openEvidence, openEvidenceTargets }),
    [openEvidence, openEvidenceTargets]
  );
  const activeTarget = state?.targets.find(
    (target) => target.selection.metric_key === state.activeMetricKey
  );
  return (
    <EvidenceDialogContext.Provider value={value}>
      {children}
      {state ? (
        <Suspense
          fallback={
            <Dialog open onOpenChange={(open) => !open && setState(null)}>
              <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[52rem] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-4rem)] sm:w-[calc(100vw-4rem)] sm:max-w-[90rem]">
                <DialogHeader className="shrink-0 border-b p-5 pr-14">
                  <DialogTitle>
                    {state.title ?? activeTarget?.label ?? "Metric evidence"}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-1 items-center justify-center">
                  <Spinner className="size-10" />
                </div>
              </DialogContent>
            </Dialog>
          }
        >
          <MetricEvidenceDialog
            state={state}
            onMetricChange={selectEvidenceMetric}
            onClose={() => setState(null)}
          />
        </Suspense>
      ) : null}
    </EvidenceDialogContext.Provider>
  );
}
