import { Info, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { MetricDefinition } from "@/api/metric-definitions-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMetricDefinitions } from "@/queries/metric-definitions";

export function MetricDefinitionsScreen() {
  const { t } = useTranslation();
  const { data: groups, isPending, isError } = useMetricDefinitions();

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <SidebarTrigger />
        <h1 className="text-xl font-semibold tracking-tight">
          {t("metric_definitions.title")}
        </h1>
      </header>

      <main className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-12">
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("metric_definitions.lead")}
          </p>

          {isPending ? <CatalogSkeleton /> : null}

          {isError ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>{t("metric_definitions.error_title")}</AlertTitle>
              <AlertDescription>
                {t("metric_definitions.error_description")}
              </AlertDescription>
            </Alert>
          ) : null}

          {groups?.map((group) => (
            <Card key={group.prefix}>
              <CardHeader>
                <CardTitle className="font-mono text-sm tracking-wide uppercase">
                  {group.prefix}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {t("metric_definitions.columns.metric")}
                      </TableHead>
                      <TableHead>
                        {t("metric_definitions.columns.description")}
                      </TableHead>
                      <TableHead>
                        {t("metric_definitions.columns.format")}
                      </TableHead>
                      <TableHead>
                        {t("metric_definitions.columns.direction")}
                      </TableHead>
                      <TableHead>
                        {t("metric_definitions.columns.dimensions")}
                      </TableHead>
                      <TableHead>
                        {t("metric_definitions.columns.status")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.metrics.map((metric) => (
                      <MetricRow key={metric.metric_key} metric={metric} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}

function MetricRow({ metric }: { metric: MetricDefinition }) {
  const { t } = useTranslation();

  return (
    <TableRow className={metric.is_enabled ? undefined : "opacity-60"}>
      <TableCell className="align-top">
        <div className="flex items-center gap-1.5 font-medium">
          {metric.label}
          {metric.explanation ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex text-muted-foreground" />
                  }
                >
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {metric.explanation}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {metric.metric_key}
        </div>
      </TableCell>
      <TableCell className="max-w-md align-top whitespace-normal text-muted-foreground">
        {metric.description}
      </TableCell>
      <TableCell className="align-top">
        <Badge variant="outline">
          {t(`metric_definitions.format.${metric.format}`)}
          {metric.unit ? ` · ${metric.unit}` : null}
        </Badge>
      </TableCell>
      <TableCell className="align-top text-muted-foreground">
        {t(`metric_definitions.direction.${metric.direction}`)}
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-wrap gap-1">
          {metric.dimensions.map((dimension) => (
            <Badge key={dimension} variant="secondary" className="font-mono">
              {dimension}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <StatusBadge metric={metric} />
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ metric }: { metric: MetricDefinition }) {
  const { t } = useTranslation();

  if (!metric.is_enabled) {
    return (
      <Badge variant="outline">{t("metric_definitions.status.disabled")}</Badge>
    );
  }
  if (metric.schema_status === "error") {
    return (
      <Badge variant="destructive">
        {t("metric_definitions.status.schema_error")}
      </Badge>
    );
  }
  if (metric.schema_status === "unchecked") {
    return (
      <Badge variant="secondary">
        {t("metric_definitions.status.unchecked")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">{t("metric_definitions.status.active")}</Badge>
  );
}

function CatalogSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
