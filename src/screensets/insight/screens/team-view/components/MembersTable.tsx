/**
 * MembersTable — clickable table of individual team members.
 * No state imports.
 */

import React from 'react';
import { Button, Card, CardContent, Table, TableHeader, TableBody, TableHead, TableRow, TableCell, Badge, Skeleton } from '@hai3/uikit';
import { DynamicWidthBar } from '../../../uikit/base/DynamicWidthBar';
import MetricInfo from '../../../uikit/base/MetricInfo';
import type { TeamMember, ColumnThreshold } from '../../../types';

export interface MembersTableProps {
  members: TeamMember[];
  columnThresholds: ColumnThreshold[];
  loading: boolean;
  onRowClick: (personId: string) => void;
  onDetailsDrill?: () => void;
  onCellDrill?: (personId: string, drillId: string) => void;
}

// Threshold lookup returns null when the key isn't configured — callers
// render the cell without color instead of silently making up good/warn
// cutoffs. Previously this function invented `{ good: 100, warn: 50 }` for
// unknown keys, which meant colors depended on values nobody chose.
function colClass(v: number | null, t: ColumnThreshold | null, type: 'text' | 'bg'): string {
  if (v === null || t === null) return type === 'text' ? 'text-gray-400' : '';
  const prefix = type === 'text' ? 'text' : 'bg';
  const good = t.higher_is_better ? v >= t.good : v <= t.good;
  const warn = t.higher_is_better ? v >= t.warn : v <= t.warn;
  if (good) return `${prefix}-insight-green`;
  if (warn) return `${prefix}-insight-amber`;
  return `${prefix}-insight-red`;
}

function getThreshold(thresholds: ColumnThreshold[], key: string): ColumnThreshold | null {
  return thresholds.find((t) => t.metric_key === key) ?? null;
}

const DrillCell: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick: (e: React.MouseEvent) => void;
}> = ({ children, className = '', onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`bg-transparent border-none p-0 cursor-pointer text-left underline decoration-dotted underline-offset-2 hover:text-blue-600 transition-colors ${className}`}
  >
    {children}
  </button>
);

const FocusBar: React.FC<{ pct: number | null; threshold: ColumnThreshold | null }> = ({ pct, threshold }) => {
  if (pct === null || !Number.isFinite(pct)) {
    return <span className="text-gray-400 text-sm">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
        <DynamicWidthBar pct={pct} colorClass={colClass(pct, threshold, 'bg')} />
      </div>
      <span className={`text-sm font-bold ${colClass(pct, threshold, 'text')}`}>{pct}%</span>
    </div>
  );
};

type ColHeader = { label: string; sub: string; info?: string };

function buildColHeaders(columnThresholds: ColumnThreshold[]): ColHeader[] {
  const buildT = getThreshold(columnThresholds, 'build_success_pct');
  const focusT = getThreshold(columnThresholds, 'focus_time_pct');
  return [
    { label: 'Name',          sub: '' },
    { label: 'Tasks',         sub: 'closed · Jira' },
    { label: 'Bugs Fixed',    sub: 'bug-type tasks · Jira' },
    { label: 'Dev Time',      sub: 'time in dev per task · lower = better',
      info: 'Average time a task spends in "In Progress" state. Lower means faster execution.' },
    { label: 'Pull Requests', sub: 'merged to main · Bitbucket' },
    { label: 'Build Success', sub: buildT ? `CI builds passing · target \u2265${buildT.good}%` : 'CI builds passing' },
    { label: 'Focus Time',    sub: focusT ? `uninterrupted work · target \u2265${focusT.good}%` : 'uninterrupted work' },
    { label: 'AI Tools',      sub: 'active this month' },
    { label: 'AI LOC Share',  sub: 'Cursor + Claude Code',
      info: 'Share of authored code lines accepted from AI suggestions out of total lines written.' },
  ];
}

const SkeletonRow: React.FC<{ count: number }> = ({ count }) => (
  <TableRow>
    {Array.from({ length: count }).map((_, i) => (
      <TableCell key={i}>
        <Skeleton className="h-3.5 w-full" />
      </TableCell>
    ))}
  </TableRow>
);

export const MembersTable: React.FC<MembersTableProps> = ({ members, columnThresholds, loading, onRowClick, onDetailsDrill, onCellDrill }) => {
  const drill = (personId: string, drillId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onCellDrill?.(personId, drillId);
  };
  const colHeaders = buildColHeaders(columnThresholds);
  const tBugs  = getThreshold(columnThresholds, 'bugs_fixed');
  const tDev   = getThreshold(columnThresholds, 'dev_time_h');
  const tBuild = getThreshold(columnThresholds, 'build_success_pct');
  const tFocus = getThreshold(columnThresholds, 'focus_time_pct');
  const tAiLoc = getThreshold(columnThresholds, 'ai_loc_share_pct');
  return (
  <Card>
    <div className="px-4 pt-3.5 pb-3 border-b border-gray-200 flex items-center justify-between">
      <span className="text-sm font-bold text-gray-900">Team Members</span>
      <div className="flex items-center gap-3">
        {onDetailsDrill && (
          <Button variant="ghost" size="sm" onClick={onDetailsDrill} className="h-auto p-0 text-xs font-medium text-blue-600 hover:text-blue-700">
            View team stats ↗
          </Button>
        )}
        <span className="hidden sm:inline text-xs text-gray-400">Click member to open IC dashboard</span>
      </div>
    </div>
    <CardContent className="p-0">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
              {colHeaders.map((col) => (
                <TableHead key={col.label} className="text-xs font-bold uppercase tracking-wide text-gray-400 h-9 px-3 bg-gray-50">
                  <span>{col.label}</span>
                  {col.info && <MetricInfo description={col.info} side="bottom" />}
                  {col.sub && (
                    <>
                      <br />
                      <span className="font-normal text-gray-300 normal-case tracking-normal text-2xs">{col.sub}</span>
                    </>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <>
                <SkeletonRow count={colHeaders.length} />
                <SkeletonRow count={colHeaders.length} />
                <SkeletonRow count={colHeaders.length} />
              </>
            ) : (
              members.map((m) => (
                <TableRow
                  key={m.person_id}
                  className="cursor-pointer border-b border-gray-200 hover:bg-blue-50/40"
                  onClick={() => onRowClick(m.person_id)}
                >
                  {/* Name + Seniority stacked */}
                  <TableCell className="px-3 py-2.5">
                    <div className="text-sm font-bold text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-400">{m.seniority}</div>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-sm">
                    {onCellDrill ? (
                      <DrillCell onClick={drill(m.person_id, 'tasks-completed')}>{m.tasks_closed}</DrillCell>
                    ) : m.tasks_closed}
                  </TableCell>
                  <TableCell className={`px-3 py-2.5 text-sm font-bold ${colClass(m.bugs_fixed, tBugs, 'text')}`}>
                    {onCellDrill ? (
                      <DrillCell onClick={drill(m.person_id, 'bugs-fixed')} className={colClass(m.bugs_fixed, tBugs, 'text')}>{m.bugs_fixed ?? '—'}</DrillCell>
                    ) : (m.bugs_fixed ?? '—')}
                  </TableCell>
                  <TableCell className={`px-3 py-2.5 text-sm font-bold ${colClass(m.dev_time_h, tDev, 'text')}`}>
                    {m.dev_time_h === null ? (
                      <span className="text-gray-400">—</span>
                    ) : onCellDrill ? (
                      <DrillCell onClick={drill(m.person_id, 'cycle-time')} className={colClass(m.dev_time_h, tDev, 'text')}>{m.dev_time_h}h</DrillCell>
                    ) : `${m.dev_time_h}h`}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-sm">
                    {onCellDrill ? (
                      <DrillCell onClick={drill(m.person_id, 'pull-requests')}>{m.prs_merged}</DrillCell>
                    ) : m.prs_merged}
                  </TableCell>
                  <TableCell className={`px-3 py-2.5 text-sm font-bold ${colClass(m.build_success_pct, tBuild, 'text')}`}>
                    {onCellDrill ? (
                      <DrillCell onClick={drill(m.person_id, 'builds')} className={colClass(m.build_success_pct, tBuild, 'text')}>
                        {m.build_success_pct !== null ? `${m.build_success_pct}%` : '—'}
                      </DrillCell>
                    ) : (m.build_success_pct !== null ? `${m.build_success_pct}%` : '—')}
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    <FocusBar pct={m.focus_time_pct} threshold={tFocus} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    {m.ai_tools.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {m.ai_tools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-2xs font-bold px-1.5 py-0 h-auto rounded bg-gray-50 border-gray-200 text-gray-400">
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={`px-3 py-2.5 text-sm font-bold ${colClass(m.ai_loc_share_pct, tAiLoc, 'text')}`}>
                    {m.ai_loc_share_pct === null ? (
                      <span className="text-gray-400">—</span>
                    ) : m.ai_loc_share_pct > 0 ? `${m.ai_loc_share_pct}%` : (
                      <span className="text-gray-400">0%</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
    </CardContent>
  </Card>
  );
};
