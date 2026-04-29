/**
 * TeamMetricsModal — wide-table modal showing every per-member bullet metric
 * (delivery / collaboration / AI / git) for the current team.
 *
 * Fetches IC_BULLET_* per person on open (N members × 4 sections in parallel)
 * and renders a sticky-name pivot of all discovered metric_keys.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  apiRegistry,
} from '@hai3/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Skeleton,
} from '@hai3/uikit';
import { InsightApiService } from '../../../api/insightApiService';
import { METRIC_REGISTRY } from '../../../api/metricRegistry';
import { BULLET_DEFS } from '../../../api/thresholdConfig';
import { odataDateFilter, odataEscapeValue, type DateRange } from '../../../utils/periodToDateRange';
import { settled, emptyOdata } from '../../../utils/settledResult';
import type { TeamMember } from '../../../types';
import type { RawBulletAggregateRow } from '../../../api/rawTypes';

type SectionId = 'delivery' | 'collaboration' | 'ai_adoption' | 'git';

const SECTIONS: { id: SectionId; metricId: string; label: string }[] = [
  { id: 'delivery',      metricId: METRIC_REGISTRY.IC_BULLET_DELIVERY, label: 'Delivery'      },
  { id: 'collaboration', metricId: METRIC_REGISTRY.IC_BULLET_COLLAB,   label: 'Collaboration' },
  { id: 'ai_adoption',   metricId: METRIC_REGISTRY.IC_BULLET_AI,       label: 'AI Adoption'   },
  { id: 'git',           metricId: METRIC_REGISTRY.IC_BULLET_GIT,      label: 'Git'           },
];

const SECTION_RANK: Record<SectionId, number> = {
  delivery: 0,
  collaboration: 1,
  ai_adoption: 2,
  git: 3,
};

type Column = { section: SectionId; metricKey: string };
type CellMap = Map<string, Map<string, number>>; // personId → metricKey → value

interface MetricMeta {
  label: string;
  unit: string;
}

// Lookup over BULLET_DEFS keeps the modal in sync with the canonical labels
// shown elsewhere (TeamHeroStrip, IC bullet sections). Falls back to the raw
// metric_key when the backend surfaces something unknown.
const METRIC_META: Record<string, MetricMeta> = BULLET_DEFS.reduce<Record<string, MetricMeta>>(
  (acc, d) => {
    if (!acc[d.metric_key]) acc[d.metric_key] = { label: d.label, unit: d.unit };
    return acc;
  },
  {},
);

const metaFor = (metricKey: string): MetricMeta =>
  METRIC_META[metricKey] ?? { label: metricKey, unit: '' };

const formatValue = (v: number): string => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toLocaleString();
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
};

export interface TeamMetricsModalProps {
  open: boolean;
  onClose: () => void;
  members: TeamMember[];
  range: DateRange;
}

const TeamMetricsModal: React.FC<TeamMetricsModalProps> = ({ open, onClose, members, range }) => {
  const [loading, setLoading]   = useState(false);
  const [cells, setCells]       = useState<CellMap>(new Map());
  const [columns, setColumns]   = useState<Column[]>([]);

  useEffect(() => {
    if (!open || members.length === 0) {
      setLoading(false);
      setCells(new Map());
      setColumns([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const api = apiRegistry.getService(InsightApiService);
    const dateFilter = odataDateFilter(range);

    type Task = { personId: string; section: SectionId; promise: Promise<unknown> };
    const tasks: Task[] = [];
    for (const m of members) {
      const personFilter = `person_id eq '${odataEscapeValue(m.person_id.toLowerCase())}' and ${dateFilter}`;
      for (const s of SECTIONS) {
        tasks.push({
          personId: m.person_id,
          section:  s.id,
          promise:  api.queryMetric<RawBulletAggregateRow>(s.metricId, { $filter: personFilter }),
        });
      }
    }

    void Promise.allSettled(tasks.map((t) => t.promise)).then((results) => {
      if (cancelled) return;

      const cellMap: CellMap = new Map();
      const seenColumns = new Map<string, SectionId>();

      results.forEach((res, i) => {
        const t = tasks[i]!;
        const resp = settled(
          res as PromiseSettledResult<{ items: RawBulletAggregateRow[]; page_info: { has_next: boolean; cursor: string | null } }>,
          emptyOdata<RawBulletAggregateRow>(),
          'IC_BULLET',
        );
        let perPerson = cellMap.get(t.personId);
        if (!perPerson) {
          perPerson = new Map();
          cellMap.set(t.personId, perPerson);
        }
        for (const row of resp.items) {
          // Only count cells that actually carry a finite value — empty
          // (null / NaN / missing) rows would otherwise add a column where
          // every member shows an em-dash.
          if (typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
          perPerson.set(row.metric_key, row.value);
          if (!seenColumns.has(row.metric_key)) {
            seenColumns.set(row.metric_key, t.section);
          }
        }
      });

      const cols: Column[] = Array.from(seenColumns.entries())
        .map(([metricKey, section]) => ({ metricKey, section }))
        .sort(
          (a, b) =>
            SECTION_RANK[a.section] - SECTION_RANK[b.section] ||
            a.metricKey.localeCompare(b.metricKey),
        );

      setCells(cellMap);
      setColumns(cols);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, members, range]);

  const sectionGroups = useMemo(() => {
    const groups: { section: SectionId; label: string; count: number }[] = [];
    for (const c of columns) {
      const last = groups[groups.length - 1];
      if (last && last.section === c.section) {
        last.count += 1;
      } else {
        const def = SECTIONS.find((s) => s.id === c.section);
        groups.push({ section: c.section, label: def?.label ?? c.section, count: 1 });
      }
    }
    return groups;
  }, [columns]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3.5 border-b border-gray-200 space-y-0">
          <DialogTitle className="text-base font-bold text-gray-900">
            All Team Member Metrics
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
                <TableHead rowSpan={2} className="sticky left-0 z-20 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-400 px-3 align-bottom">
                  Member
                </TableHead>
                {sectionGroups.map((g) => (
                  <TableHead
                    key={g.section}
                    colSpan={g.count}
                    className="text-xs font-bold uppercase tracking-wide text-gray-500 text-center border-l border-gray-200 bg-gray-50"
                  >
                    {g.label}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
                {columns.map((c, i) => {
                  const prev = columns[i - 1];
                  const sectionStart = !prev || prev.section !== c.section;
                  const meta = metaFor(c.metricKey);
                  return (
                    <TableHead
                      key={`${c.section}:${c.metricKey}`}
                      className={`text-2xs font-medium normal-case tracking-normal text-gray-500 px-3 bg-gray-50 whitespace-nowrap text-right ${sectionStart ? 'border-l border-gray-200' : ''}`}
                    >
                      <span>{meta.label}</span>
                      {meta.unit && (
                        <span className="ml-1 text-gray-300">{meta.unit === '%' ? '%' : `(${meta.unit})`}</span>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: Math.min(members.length, 6) }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="sticky left-0 bg-white">
                      <Skeleton className="h-3.5 w-32" />
                    </TableCell>
                    {columns.length === 0 ? (
                      <TableCell><Skeleton className="h-3.5 w-full" /></TableCell>
                    ) : columns.map((c) => (
                      <TableCell key={`${c.section}:${c.metricKey}`}><Skeleton className="h-3.5 w-12" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : columns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={1} className="px-3 py-6 text-sm text-gray-400 text-center">
                    No bullet metrics returned for these members.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow key={m.person_id} className="border-b border-gray-200 hover:bg-blue-50/40">
                    <TableCell className="sticky left-0 z-10 bg-white px-3 py-2.5">
                      <div className="text-sm font-bold text-gray-900">{m.name}</div>
                      <div className="text-xs text-gray-400">{m.seniority}</div>
                    </TableCell>
                    {columns.map((c, i) => {
                      const v = cells.get(m.person_id)?.get(c.metricKey);
                      const prev = columns[i - 1];
                      const sectionStart = !prev || prev.section !== c.section;
                      return (
                        <TableCell
                          key={`${c.section}:${c.metricKey}`}
                          className={`px-3 py-2.5 text-sm whitespace-nowrap text-right tabular-nums ${sectionStart ? 'border-l border-gray-200' : ''} ${v === undefined ? 'text-gray-400' : 'text-gray-900'}`}
                        >
                          {v === undefined ? '—' : formatValue(v)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TeamMetricsModal;
