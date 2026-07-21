import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  queryBatchWithRange,
  queryMetric,
  type BatchQueryResult,
} from "@/api/analytics-client";
import type { CatalogResponse } from "@/api/catalog-client";
import { METRIC_REGISTRY } from "@/api/metric-registry";
import {
  previousPeriodRange,
  type DateRange,
} from "@/api/period-to-date-range";
import { odataEscapeValue } from "@/api/odata";
import { getPerson } from "@/api/identity-client";
import { getViewerEmail } from "@/auth";
import { findIdentityNode } from "@/lib/insight/identity-tree";
import {
  transformBulletMetrics,
  transformDeliveryTrend,
  transformDrill,
  transformIcKpis,
  transformLocTrend,
  transformTimeOff,
} from "@/api/transforms";
import { useCatalog } from "@/api/use-catalog";
import type {
  RawBulletAggregateRow,
  RawDeliveryTrendRow,
  RawDrillRow,
  RawIcAggregateRow,
  RawLocTrendRow,
  RawTimeOffRow,
} from "@/api/raw-types";
import type {
  BulletMetric,
  DeliveryDataPoint,
  DrillData,
  IcKpi,
  IdentityPerson,
  LocDataPoint,
  PeriodValue,
  TimeOffNotice,
} from "@/types/insight";

function personScope(personId: string): string {
  return `person_id eq '${odataEscapeValue(personId.toLowerCase())}'`;
}

export function useIcPerson(personId: string): UseQueryResult<IdentityPerson> {
  const queryClient = useQueryClient();
  const key = personId.toLowerCase();
  return useQuery({
    queryKey: ["identity", "person", key],
    queryFn: () => getPerson(personId),
    enabled: Boolean(personId),
    // A subordinate's identity (name, title, own subtree) already rides the
    // viewer's cached org tree — surface it immediately instead of waiting
    // for the canonical per-person fetch, which still runs and replaces it.
    placeholderData: () => {
      const viewerKey = getViewerEmail()?.toLowerCase();
      if (!viewerKey || viewerKey === key) return undefined;
      const viewerTree = queryClient.getQueryData<IdentityPerson>([
        "identity",
        "person",
        viewerKey,
      ]);
      return viewerTree
        ? (findIdentityNode(viewerTree, personId) ?? undefined)
        : undefined;
    },
  });
}

export function useIcKpis(
  personId: string,
  period: PeriodValue,
  range: DateRange
): UseQueryResult<IcKpi[]> {
  const prevRange = previousPeriodRange(range, period);
  const { data: catalog } = useCatalog();
  // Catalog identity in the query key so a late-arriving catalog
  // hydration re-runs the transform — the queryFn closes over `catalog`
  // and would otherwise cache an empty result built against an
  // undefined catalog.
  const catalogKey = catalog?.generated_at ?? null;
  return useQuery({
    queryKey: ["ic", "kpis", personId, period, range.from, range.to, catalogKey],
    queryFn: async () => {
      const [cur, prev] = await Promise.all([
        queryMetric<RawIcAggregateRow>(METRIC_REGISTRY.IC_KPIS, range, {
          $filter: personScope(personId),
        }),
        queryMetric<RawIcAggregateRow>(METRIC_REGISTRY.IC_KPIS, prevRange, {
          $filter: personScope(personId),
        }),
      ]);
      return transformIcKpis(
        cur.items[0] ?? null,
        prev.items[0] ?? null,
        period,
        catalog,
      );
    },
  });
}

const BULLET_SECTIONS = {
  task_delivery: METRIC_REGISTRY.IC_BULLET_DELIVERY,
  code_quality: METRIC_REGISTRY.IC_BULLET_DELIVERY,
  collaboration: METRIC_REGISTRY.IC_BULLET_COLLAB,
  ai_adoption: METRIC_REGISTRY.IC_BULLET_AI,
  git_output: METRIC_REGISTRY.IC_BULLET_GIT,
} as const;

export type IcBulletSectionId = keyof typeof BULLET_SECTIONS;

export function useIcBulletSection(
  sectionId: IcBulletSectionId,
  personId: string,
  period: PeriodValue,
  range: DateRange
): UseQueryResult<BulletMetric[]> {
  const metricId = BULLET_SECTIONS[sectionId];
  const { data: catalog } = useCatalog();
  const catalogKey = catalog?.generated_at ?? null;
  return useQuery({
    queryKey: [
      "ic",
      "bullet",
      sectionId,
      personId,
      period,
      range.from,
      range.to,
      catalogKey,
    ],
    queryFn: async () => {
      const resp = await queryMetric<RawBulletAggregateRow>(metricId, range, {
        $filter: personScope(personId),
      });
      return transformBulletMetrics(
        resp.items,
        sectionId,
        period,
        undefined,
        "ic",
        catalog,
      );
    },
  });
}

export function useIcLocTrend(
  personId: string,
  period: PeriodValue,
  range: DateRange
): UseQueryResult<LocDataPoint[]> {
  return useQuery({
    queryKey: ["ic", "loc-trend", personId, period, range.from, range.to],
    queryFn: async () => {
      const resp = await queryMetric<RawLocTrendRow>(
        METRIC_REGISTRY.IC_CHART_LOC,
        range,
        { $filter: personScope(personId) }
      );
      return transformLocTrend(resp.items, period);
    },
  });
}

export function useIcDeliveryTrend(
  personId: string,
  period: PeriodValue,
  range: DateRange
): UseQueryResult<DeliveryDataPoint[]> {
  return useQuery({
    queryKey: ["ic", "delivery-trend", personId, period, range.from, range.to],
    queryFn: async () => {
      const resp = await queryMetric<RawDeliveryTrendRow>(
        METRIC_REGISTRY.IC_CHART_DELIVERY,
        range,
        { $filter: personScope(personId) }
      );
      return transformDeliveryTrend(resp.items, period);
    },
  });
}

export function useIcTimeOff(
  personId: string,
  range: DateRange
): UseQueryResult<TimeOffNotice | null> {
  return useQuery({
    queryKey: ["ic", "timeoff", personId, range.from, range.to],
    queryFn: async () => {
      const resp = await queryMetric<RawTimeOffRow>(
        METRIC_REGISTRY.IC_TIMEOFF,
        range,
        { $filter: personScope(personId) }
      );
      return resp.items[0] ? transformTimeOff(resp.items[0]) : null;
    },
  });
}

export function useIcDrill(
  personId: string,
  drillId: string | null,
  range: DateRange
): UseQueryResult<DrillData | null> {
  return useQuery({
    queryKey: ["ic", "drill", drillId, personId, range.from, range.to],
    enabled: Boolean(drillId),
    queryFn: async () => {
      if (!drillId) return null;
      const filter = `${personScope(personId)} and drill_id eq '${odataEscapeValue(drillId)}'`;
      const resp = await queryMetric<RawDrillRow>(
        METRIC_REGISTRY.IC_DRILL,
        range,
        { $filter: filter }
      );
      return resp.items[0] ? transformDrill(resp.items[0]) : null;
    },
  });
}

export type IcDashboardSection =
  | "kpis"
  | "task_delivery"
  | "code_quality"
  | "git_output"
  | "ai_adoption"
  | "collaboration"
  | "loc_trend"
  | "delivery_trend"
  | "time_off";

export interface IcDashboardData {
  kpis: IcKpi[];
  taskDelivery: BulletMetric[];
  codeQuality: BulletMetric[];
  gitOutput: BulletMetric[];
  aiAdoption: BulletMetric[];
  collaboration: BulletMetric[];
  locTrend: LocDataPoint[];
  deliveryTrend: DeliveryDataPoint[];
  timeOff: TimeOffNotice | null;
  errors: Record<IcDashboardSection, boolean>;
}

function isOk<T>(
  r: BatchQueryResult<T> | undefined,
): r is Extract<BatchQueryResult<T>, { status: "ok" }> {
  return r?.status === "ok";
}

export function useIcDashboardData(
  personId: string,
  period: PeriodValue,
  range: DateRange,
  options?: { keepPrevious?: boolean },
): UseQueryResult<IcDashboardData> {
  const prevRange = previousPeriodRange(range, period);
  const filter = personScope(personId);
  const { data: catalog } = useCatalog();
  const catalogKey = catalog?.generated_at ?? null;
  return useQuery({
    queryKey: [
      "ic",
      "dashboard",
      personId,
      period,
      range.from,
      range.to,
      catalogKey,
    ],
    enabled: Boolean(personId),
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
    queryFn: async (): Promise<IcDashboardData> => {
      const cat: CatalogResponse | undefined = catalog;
      const [current, prior] = await Promise.all([
        queryBatchWithRange<
          | RawIcAggregateRow
          | RawBulletAggregateRow
          | RawLocTrendRow
          | RawDeliveryTrendRow
          | RawTimeOffRow
        >(range, [
          { id: "kpis", metric_id: METRIC_REGISTRY.IC_KPIS, $filter: filter },
          // One IC_BULLET_DELIVERY execution feeds both the task_delivery and
          // code_quality transforms (the query emits rows for both sections;
          // the catalog wire-prefix partitions them).
          {
            id: "delivery_bullets",
            metric_id: METRIC_REGISTRY.IC_BULLET_DELIVERY,
            $filter: filter,
          },
          {
            id: "git_output",
            metric_id: METRIC_REGISTRY.IC_BULLET_GIT,
            $filter: filter,
          },
          {
            id: "ai_adoption",
            metric_id: METRIC_REGISTRY.IC_BULLET_AI,
            $filter: filter,
          },
          {
            id: "collaboration",
            metric_id: METRIC_REGISTRY.IC_BULLET_COLLAB,
            $filter: filter,
          },
          {
            id: "loc_trend",
            metric_id: METRIC_REGISTRY.IC_CHART_LOC,
            $filter: filter,
          },
          {
            id: "delivery_trend",
            metric_id: METRIC_REGISTRY.IC_CHART_DELIVERY,
            $filter: filter,
          },
          {
            id: "time_off",
            metric_id: METRIC_REGISTRY.IC_TIMEOFF,
            $filter: filter,
          },
        ]),
        queryBatchWithRange<RawIcAggregateRow>(prevRange, [
          { id: "kpis_prior", metric_id: METRIC_REGISTRY.IC_KPIS, $filter: filter },
        ]),
      ]);

      const byId = new Map<string, BatchQueryResult<unknown>>();
      for (const r of current.results) {
        if (r.id) byId.set(r.id, r as BatchQueryResult<unknown>);
      }
      for (const r of prior.results) {
        if (r.id) byId.set(r.id, r as BatchQueryResult<unknown>);
      }

      const get = <T>(id: string): T[] | undefined => {
        const r = byId.get(id) as BatchQueryResult<T> | undefined;
        return isOk(r) ? r.items : undefined;
      };

      const kpisCur = get<RawIcAggregateRow>("kpis");
      const kpisPrior = get<RawIcAggregateRow>("kpis_prior");

      const kpisErrored =
        !isOk(byId.get("kpis") as BatchQueryResult<unknown> | undefined) ||
        !isOk(byId.get("kpis_prior") as BatchQueryResult<unknown> | undefined);

      const sectionErrored = (id: string): boolean =>
        !isOk(byId.get(id) as BatchQueryResult<unknown> | undefined);

      return {
        kpis: transformIcKpis(
          kpisCur?.[0] ?? null,
          kpisPrior?.[0] ?? null,
          period,
          cat,
        ),
        taskDelivery: transformBulletMetrics(
          get<RawBulletAggregateRow>("delivery_bullets") ?? [],
          "task_delivery",
          period,
          undefined,
          "ic",
          cat,
        ),
        codeQuality: transformBulletMetrics(
          get<RawBulletAggregateRow>("delivery_bullets") ?? [],
          "code_quality",
          period,
          undefined,
          "ic",
          cat,
        ),
        gitOutput: transformBulletMetrics(
          get<RawBulletAggregateRow>("git_output") ?? [],
          "git_output",
          period,
          undefined,
          "ic",
          cat,
        ),
        aiAdoption: transformBulletMetrics(
          get<RawBulletAggregateRow>("ai_adoption") ?? [],
          "ai_adoption",
          period,
          undefined,
          "ic",
          cat,
        ),
        collaboration: transformBulletMetrics(
          get<RawBulletAggregateRow>("collaboration") ?? [],
          "collaboration",
          period,
          undefined,
          "ic",
          cat,
        ),
        locTrend: transformLocTrend(
          get<RawLocTrendRow>("loc_trend") ?? [],
          period,
        ),
        deliveryTrend: transformDeliveryTrend(
          get<RawDeliveryTrendRow>("delivery_trend") ?? [],
          period,
        ),
        timeOff: (() => {
          const rows = get<RawTimeOffRow>("time_off");
          return rows?.[0] ? transformTimeOff(rows[0]) : null;
        })(),
        errors: {
          kpis: kpisErrored,
          task_delivery: sectionErrored("delivery_bullets"),
          code_quality: sectionErrored("delivery_bullets"),
          git_output: sectionErrored("git_output"),
          ai_adoption: sectionErrored("ai_adoption"),
          collaboration: sectionErrored("collaboration"),
          loc_trend: sectionErrored("loc_trend"),
          delivery_trend: sectionErrored("delivery_trend"),
          time_off: sectionErrored("time_off"),
        },
      };
    },
  });
}
