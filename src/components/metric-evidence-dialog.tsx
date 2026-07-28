import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import {
  downloadMetricDrilldown,
  queryMetricDrilldown,
  type MetricEvidenceSelection,
} from "@/api/metric-drilldown-client";
import { AnalyticsApiError } from "@/api/analytics-client";
import { useAuth } from "@/auth/use-auth";
import type { EvidenceDialogState } from "@/components/metric-evidence-context";
import { MetricEvidenceTable } from "@/components/metric-evidence-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

export function MetricEvidenceDialog({
  state,
  onClose,
}: {
  state: EvidenceDialogState | null;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const tenantId = session?.tenantId ?? null;
  const exportController = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFailure, setExportFailure] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["metric-drilldown", tenantId, state?.selection],
    queryFn: ({ pageParam, signal }) =>
      queryMetricDrilldown(
        {
          ...(state?.selection as MetricEvidenceSelection),
          cursor: pageParam,
          limit: 100,
        },
        signal
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: state != null && tenantId != null,
    retry: (failureCount, error) =>
      failureCount < 1 &&
      (!(error instanceof AnalyticsApiError) || error.status >= 500),
  });
  const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];
  const columns = useMemo(() => {
    const columns = query.data?.pages[0]?.columns ?? [];
    const order = new Map([
      ["ref", 0],
      ["title", 1],
      ["repository", 2],
      ["author", 3],
      ["date", 100],
      ["value", 101],
      ["numerator", 101],
      ["denominator", 102],
    ]);
    return [...columns].sort(
      (left, right) =>
        (order.get(left.key) ?? 50) - (order.get(right.key) ?? 50) ||
        left.label.localeCompare(right.label)
    );
  }, [query.data?.pages]);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const pageLimitReached = (query.data?.pages.length ?? 0) >= 50 && hasNextPage;

  useEffect(
    () => () => {
      exportController.current?.abort();
    },
    []
  );

  async function exportRows(format: "csv" | "xlsx") {
    if (!state) return;
    exportController.current?.abort();
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportFailure(null);
    try {
      await downloadMetricDrilldown(state.selection, format, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportFailure(
          errorMessage(error, "Unable to export metric evidence")
        );
      }
    } finally {
      if (exportController.current === controller) {
        exportController.current = null;
        setExporting(false);
      }
    }
  }

  return (
    <Dialog open={state != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[52rem] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-4rem)] sm:w-[calc(100vw-4rem)] sm:max-w-[90rem] [&_[data-slot=dialog-close]]:top-5">
        <DialogHeader className="shrink-0 border-b p-5 pr-14">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{state?.label ?? "Metric evidence"}</DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={exporting || query.isPending || query.isError}
                render={
                  <Button variant="outline" size="sm">
                    {exporting ? <Spinner /> : <Download />}
                    Export
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportRows("csv")}>
                  <FileText />
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportRows("xlsx")}>
                  <FileSpreadsheet />
                  Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {exportFailure ? (
            <p role="alert" className="text-sm text-destructive">
              {exportFailure}
            </p>
          ) : null}
        </DialogHeader>
        {query.isPending ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-10" />
          </div>
        ) : query.isError && !query.data ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p role="alert" className="text-sm text-muted-foreground">
              {errorMessage(query.error, "Unable to load metric evidence")}
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No supporting data for this selection
          </div>
        ) : (
          <MetricEvidenceTable
            rows={rows}
            columns={columns}
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage && !pageLimitReached}
            isFetchingNextPage={isFetchingNextPage}
            nextPageError={query.isFetchNextPageError}
            pageLimitReached={pageLimitReached}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (
    !(error instanceof AnalyticsApiError) ||
    !error.body ||
    typeof error.body !== "object"
  ) {
    return fallback;
  }
  const problem = error.body as { detail?: unknown; trace_id?: unknown };
  const detail = typeof problem.detail === "string" ? problem.detail : fallback;
  return typeof problem.trace_id === "string"
    ? `${detail} Trace: ${problem.trace_id}`
    : detail;
}
