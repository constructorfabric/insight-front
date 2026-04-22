/**
 * BulletChart — composite component for bullet metric visualization.
 * Supports 'chart' mode (track + footer) and 'tile' mode (compact card).
 * No state imports. Props-only (no internal state except hover).
 */

import React from 'react';
import { Badge } from '@hai3/uikit';
import { ProgressTrack } from '../base/ProgressTrack';
import ComingSoon from './ComingSoon';
import type { BulletMetric } from '../../types';

type KnownStatus = 'good' | 'warn' | 'bad';

// Status class maps
const STATUS_BAR_CLASS: Record<KnownStatus, string> = {
  good: 'bg-insight-green',
  warn: 'bg-insight-amber',
  bad: 'bg-insight-red',
};

const STATUS_BADGE_CLASS: Record<KnownStatus, string> = {
  good: 'bg-insight-green-bg text-insight-green',
  warn: 'bg-insight-amber-bg text-insight-amber',
  bad: 'bg-insight-red-bg text-insight-red',
};

const STATUS_ARROW: Record<KnownStatus, string> = {
  good: '↑',
  warn: '→',
  bad: '↓',
};

// Units that suppress period suffix
const SUPPRESS_SUFFIX_UNITS = ['%', '×', 'h', 'avg replies', 'avg', '/mo'];

function getPeriodSuffix(unit: string, period?: string): string {
  if (!period) return '';
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

export interface BulletChartProps {
  metric: BulletMetric & { period?: string };
  onDrillClick?: (drillId: string) => void;
  mode?: 'chart' | 'tile';
  personName?: string;
}

const BulletChart: React.FC<BulletChartProps> = ({
  metric,
  onDrillClick,
  mode = 'chart',
  personName,
}) => {
  const {
    label,
    sublabel,
    value,
    unit,
    bar_left_pct,
    bar_width_pct,
    median_left_pct,
    median_label,
    range_min,
    range_max,
    status,
    drill_id,
    period,
  } = metric;

  const suffix = getPeriodSuffix(unit, period);
  const isDrillable = !!drill_id;

  const handleDrillClick = () => {
    if (isDrillable && onDrillClick) {
      onDrillClick(drill_id);
    }
  };

  // Build sublabel with personName appended
  const fullSublabel = sublabel
    ? personName
      ? `${sublabel} · ${personName}`
      : sublabel
    : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && isDrillable) {
      e.preventDefault();
      handleDrillClick();
    }
  };

  // Backend supplied no distribution — render ComingSoon in the bar slot
  // instead of faking a "good/warn/bad" bar from synthetic fallbacks. Keep
  // label/sublabel/value so context stays visible.
  const isUnavailable = status === 'unavailable';
  const knownStatus: KnownStatus = isUnavailable ? 'warn' : status;

  if (mode === 'tile') {
    return (
      <div
        className={`bg-slate-100 rounded-lg px-3.5 py-3 ${isDrillable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2' : 'cursor-default'}`}
        role={isDrillable ? 'button' : undefined}
        tabIndex={isDrillable ? 0 : undefined}
        onClick={isDrillable ? handleDrillClick : undefined}
        onKeyDown={isDrillable ? handleKeyDown : undefined}
        aria-label={isDrillable ? `${label}: ${value} ${unit}` : undefined}
      >
        <div className="text-sm text-gray-500 font-medium mb-0.5">{label}</div>
        <div className="flex items-baseline gap-0.5 mb-1">
          <span className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</span>
          {unit && <span className="text-sm text-gray-400">{unit}</span>}
          {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
        </div>
        {isUnavailable ? (
          <ComingSoon variant="chip" />
        ) : (
          <Badge className={`text-sm font-semibold gap-1 ${STATUS_BADGE_CLASS[knownStatus]}`}>
            {STATUS_ARROW[knownStatus]} {median_label}
          </Badge>
        )}
      </div>
    );
  }

  // Chart mode
  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <span className="text-base text-gray-700 font-semibold leading-snug">{label}</span>
          {fullSublabel && (
            <div className="text-xs text-gray-400 font-normal leading-tight">{fullSublabel}</div>
          )}
        </div>
        <div className="text-right">
          <span
            className={`text-xl font-extrabold text-gray-900 leading-none ${isDrillable ? 'border-b border-dotted border-blue-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 rounded-sm' : 'cursor-default'}`}
            role={isDrillable ? 'button' : undefined}
            tabIndex={isDrillable ? 0 : undefined}
            onClick={isDrillable ? handleDrillClick : undefined}
            onKeyDown={isDrillable ? handleKeyDown : undefined}
            aria-label={isDrillable ? `Drill into ${label}` : undefined}
          >
            {value}
          </span>
          {unit && <span className="text-sm text-gray-400 ml-1">{unit}</span>}
          {suffix && <span className="text-xs text-gray-300 ml-0.5">{suffix}</span>}
        </div>
      </div>

      {/* Track or ComingSoon */}
      {isUnavailable ? (
        <div className="mt-1"><ComingSoon variant="row" /></div>
      ) : (
        <>
          <ProgressTrack
            barLeftPct={bar_left_pct}
            barWidthPct={bar_width_pct}
            medianLeftPct={median_left_pct}
            barColorClass={STATUS_BAR_CLASS[knownStatus]}
          />
          <div className="flex justify-between mt-0.5 text-xs text-gray-400">
            <span>{range_min}</span>
            <span className="text-gray-500 font-medium">{median_label}</span>
            <span>{range_max}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(BulletChart);
