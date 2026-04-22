/**
 * KpiStrip — horizontal KPI summary strip.
 * Renders a flex row of KPI cells with value, label, sublabel, delta badge.
 * plain=true: bare grid; plain=false: Card wrapper with shadow.
 * No state imports.
 */

import React from 'react';
import { Badge, Card, CardContent } from '@hai3/uikit';
import MetricInfo from '../base/MetricInfo';
import ComingSoon from './ComingSoon';

// Units that suppress period suffix
const SUPPRESS_SUFFIX_UNITS = ['%', '×', 'h', 'avg replies', 'avg', '/mo'];

function getPeriodSuffix(unit: string | undefined, period?: string): string {
  if (!period || !unit) return '';
  const u = unit.toLowerCase();
  if (SUPPRESS_SUFFIX_UNITS.some((s) => u.includes(s))) return '';
  const map: Record<string, string> = {
    week: '/ wk',
    month: '/ mo',
    quarter: '/ qtr',
    year: '/ yr',
  };
  return map[period] ?? '';
}

const DELTA_CLASS: Record<string, string> = {
  good: 'bg-green-100 text-green-600',
  warn: 'bg-amber-100 text-amber-600',
  neutral: 'bg-amber-100 text-amber-600',
  bad: 'bg-red-100 text-red-600',
};

export interface KpiStripKpi {
  metric_key: string;
  label: string;
  /** `null` → cell renders ComingSoon chip instead of a value. */
  value: string | null;
  unit?: string;
  sublabel?: string;
  description?: string;
  delta?: string;
  delta_type?: 'good' | 'warn' | 'bad' | 'neutral';
  period?: string;
}

export interface KpiStripProps {
  kpis: KpiStripKpi[];
  plain?: boolean;
}

const KpiCell: React.FC<{ kpi: KpiStripKpi; index: number; total: number }> = ({
  kpi,
  index,
}) => {
  const suffix = getPeriodSuffix(kpi.unit, kpi.period);
  const deltaClass = kpi.delta_type ? DELTA_CLASS[kpi.delta_type] : null;

  // Mobile grid: left border on odd columns, top border on rows > 0
  const mobileBorder = [
    index % 2 !== 0 ? 'border-l border-gray-200' : '',
    index >= 2 ? 'border-t border-gray-100' : '',
  ].filter(Boolean).join(' ');

  const isMissing = kpi.value === null;

  return (
    <div className={`relative flex-1 px-3 py-2 ${mobileBorder}`}>
      {/* Vertical separator — desktop flex only */}
      {index > 0 && (
        <div className="hidden sm:block absolute left-0 top-[15%] h-[70%] w-px bg-gray-200" />
      )}

      {/* Value row — ComingSoon chip when backend returned NULL (source not
          ingested yet). Otherwise the normal formatted value + unit + suffix. */}
      {isMissing ? (
        <ComingSoon variant="chip" />
      ) : (
        <div className="flex items-baseline gap-px">
          <span className="text-xl font-extrabold text-gray-900 leading-tight">{kpi.value}</span>
          {kpi.unit && (
            <sup className="text-xs font-semibold text-gray-400">{kpi.unit}</sup>
          )}
          {suffix && (
            <span className="text-2xs text-gray-400 ml-0.5">{suffix}</span>
          )}
        </div>
      )}

      {/* Label + optional tooltip */}
      <div className="flex items-center mt-0.5">
        <span className="text-sm font-semibold text-gray-900">{kpi.label}</span>
        {kpi.description && <MetricInfo description={kpi.description} />}
      </div>

      {/* Sublabel (data source) */}
      {kpi.sublabel && (
        <div className="text-2xs text-gray-400">{kpi.sublabel}</div>
      )}

      {/* Delta badge — suppressed when value is missing (nothing to compare). */}
      {!isMissing && kpi.delta && deltaClass && (
        <Badge className={`mt-1 text-xs font-bold ${deltaClass}`}>
          {kpi.delta}
        </Badge>
      )}
    </div>
  );
};

const KpiStripGrid: React.FC<{ kpis: KpiStripKpi[] }> = ({ kpis }) => (
  <div className="grid grid-cols-2 sm:flex">
    {kpis.map((kpi, i) => (
      <KpiCell key={kpi.metric_key} kpi={kpi} index={i} total={kpis.length} />
    ))}
  </div>
);

const KpiStrip: React.FC<KpiStripProps> = ({ kpis, plain = false }) => {
  const body = kpis.length === 0
    ? <div className="p-3"><ComingSoon variant="card" /></div>
    : <KpiStripGrid kpis={kpis} />;

  if (plain) {
    return body;
  }
  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
};

export default React.memo(KpiStrip);
