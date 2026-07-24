import { CenteredSpinner } from "@/components/widgets/centered-spinner";
import { ComingSoon } from "@/components/widgets/coming-soon";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCatalog } from "@/api/use-catalog";
import type { SchemaStatus } from "@/api/catalog-client";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<SchemaStatus, string> = {
  ok: "bg-success/15 text-success",
  error: "bg-destructive/15 text-destructive",
  unchecked: "bg-muted text-muted-foreground",
};

/** Manage-zone surfaces backed by live data (Metric catalog, Data health). */
export function ManageView({ item }: { item: string | null }) {
  if (item === "metric-catalog") return <MetricCatalogTable />;
  if (item === "data-health") return <DataHealth />;
  return (
    <div className="mx-auto w-full max-w-md p-8">
      <ComingSoon
        variant="card"
        state="empty"
        label="Admin surface — not wired yet"
      />
    </div>
  );
}

function MetricCatalogTable() {
  const { data, isLoading, isError, refetch } = useCatalog();
  if (isLoading) return <CenteredSpinner className="min-h-[60vh]" />;
  if (isError || !data)
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ComingSoon variant="card" state="error" onRetry={refetch} />
      </div>
    );

  const metrics = [...data.metrics].sort((a, b) =>
    (a.metric_key ?? a.label).localeCompare(b.metric_key ?? b.label),
  );

  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Metric catalog</h1>
        <p className="text-sm text-muted-foreground">
          {metrics.length} metrics · live from{" "}
          <code className="text-xs">/catalog/get_metrics</code>
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric key</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Sources</TableHead>
              <TableHead>Schema</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">
                  {m.metric_key ?? "—"}
                </TableCell>
                <TableCell>{m.label}</TableCell>
                <TableCell className="text-muted-foreground">
                  {m.unit || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.source_tags.length ? m.source_tags.join(" · ") : "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn("font-medium", STATUS_STYLE[m.schema_status])}
                  >
                    {m.schema_status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function DataHealth() {
  const { data, isLoading, isError, refetch } = useCatalog();
  if (isLoading) return <CenteredSpinner className="min-h-[60vh]" />;
  if (isError || !data)
    return (
      <div className="mx-auto w-full max-w-md p-8">
        <ComingSoon variant="card" state="error" onRetry={refetch} />
      </div>
    );

  const counts: Record<string, number> = { ok: 0, error: 0, unchecked: 0 };
  for (const m of data.metrics) counts[m.schema_status] = (counts[m.schema_status] ?? 0) + 1;
  const total = data.metrics.length;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Data health</h1>
        <p className="text-sm text-muted-foreground">
          Catalog schema-check status across {total} metrics
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
        {(["ok", "error", "unchecked"] as const).map((s) => (
          <div key={s} className="rounded-lg border bg-card p-4">
            <div className="text-3xl font-semibold tabular-nums">
              {counts[s] ?? 0}
            </div>
            <div
              className={cn(
                "mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_STYLE[s],
              )}
            >
              {s}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
