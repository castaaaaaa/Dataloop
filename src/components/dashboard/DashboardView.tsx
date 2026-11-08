import React, { useState, useEffect } from 'react';
import { db } from '../../lib/db/store';
import { useAuth } from '../../lib/auth/AuthContext';
import {
  Play,
  Pause,
  Clock,
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  Search,
  ExternalLink,
  Plus
} from 'lucide-react';
import { SyncConfigRow } from '../../lib/db/schema';

interface DashboardViewProps {
  onOpenWizard: () => void;
  onSelectSync: (syncId: string) => void;
  onNavigate: (view: string) => void;
  onRefresh: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenWizard,
  onSelectSync,
  onNavigate,
  onRefresh
}) => {
  const { user, session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'error'>('all');
  const [runningSyncId, setRunningSyncId] = useState<string | null>(null);
  const [runNotification, setRunNotification] = useState<string | null>(null);
  const [dbSyncs, setDbSyncs] = useState<SyncConfigRow[]>([]);

  useEffect(() => {
    let isMounted = true;
    const loadSyncs = async () => {
      try {
        const headers: Record<string, string> = {
          'x-workspace-id': db.currentWorkspaceId
        };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        if (user?.id) headers['x-user-id'] = user.id;

        const res = await fetch('/api/v1/syncs', { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.syncs) {
            setDbSyncs(data.syncs);
          }
        }
      } catch {}
    };
    loadSyncs();
    return () => {
      isMounted = false;
    };
  }, [session, user, onRefresh]);

  const syncs = dbSyncs.length > 0 ? dbSyncs : db.getSyncConfigs();
  const endpoints = db.getDataEndpoints();
  const runs = db.getSyncRuns();

  const activeSyncs = syncs.filter((s) => s.status === 'active').length;
  const errorSyncs = syncs.filter((s) => s.status === 'error').length;
  const recordsProcessed7d = runs.reduce((acc, r) => acc + (r.recordsRead || 0), 0);
  const totalRuns = runs.length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const failureRate = totalRuns > 0 ? Math.round((failedRuns / totalRuns) * 100) : 0;

  // Dynamically compute past 7 days execution activity from database runs
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayName = d.toLocaleDateString([], { weekday: 'short' });
    const dateStr = d.toISOString().slice(0, 10);
    const dayRuns = runs.filter((r) => r.startedAt?.slice(0, 10) === dateStr);
    const records = dayRuns.reduce((acc, r) => acc + (r.recordsRead || 0), 0);
    return { day: dayName, records, runs: dayRuns.length };
  });
  const maxDayRecords = Math.max(...last7Days.map((b) => b.records), 1);

  // Filter syncs
  const filteredSyncs = syncs.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q);
    }
    return true;
  });

  const getEndpoint = (epId: string) => endpoints.find((e) => e.id === epId);

  const getConnectorName = (connId: string) => {
    switch (connId) {
      case 'google_sheets':
        return 'Google Sheets';
      case 'airtable':
        return 'Airtable';
      case 'notion':
        return 'Notion';
      case 'hubspot':
        return 'HubSpot';
      case 'csv':
        return 'CSV';
      default:
        return 'Database';
    }
  };

  const handleRunNow = async (syncId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRunningSyncId(syncId);
    setRunNotification(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (user?.id) headers['x-user-id'] = user.id;

      const res = await fetch(`/api/v1/syncs/${syncId}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ isDryRun: false })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Sync run failed to start');
      }

      const data = await res.json();
      setRunNotification(
        `Background sync job started (${data.runId}). Live progress updating.`
      );
      onRefresh();
    } catch (err: any) {
      setRunNotification(`Sync failed: ${err.message || String(err)}`);
    } finally {
      setRunningSyncId(null);
      setTimeout(() => setRunNotification(null), 5000);
    }
  };

  const handleTogglePause = (sync: SyncConfigRow, e: React.MouseEvent) => {
    e.stopPropagation();
    sync.status = sync.status === 'active' ? 'paused' : 'active';
    sync.updatedAt = new Date().toISOString();
    db.logAudit(`sync.${sync.status}`, 'sync_config', sync.id);
    onRefresh();
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6 font-sans">
      {/* Notification Banner */}
      {runNotification && (
        <div
          className="p-3 rounded-[6px] border flex items-center justify-between text-[12px] animate-in fade-in"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--accent)',
            color: 'var(--text-primary)'
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="font-medium">{runNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setRunNotification(null)}
            className="text-[12px] font-medium cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-[24px] font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Dashboard
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Overview of pipelines, sync frequency, and recent record activity.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenWizard}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer self-start sm:self-auto"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-text)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent)';
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New sync</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1 */}
        <div
          className="p-4 rounded-[6px] border space-y-1"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <span className="text-[12px] font-medium block" style={{ color: 'var(--text-muted)' }}>
            Active syncs
          </span>
          <div className="flex items-baseline justify-between">
            <span
              className="text-[24px] font-semibold font-mono tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {activeSyncs}
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              of {syncs.length} total
            </span>
          </div>
        </div>

        {/* Card 2 */}
        <div
          className="p-4 rounded-[6px] border space-y-1"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <span className="text-[12px] font-medium block" style={{ color: 'var(--text-muted)' }}>
            Syncs with errors
          </span>
          <div className="flex items-baseline justify-between">
            <span
              className="text-[24px] font-semibold font-mono tabular-nums"
              style={{ color: errorSyncs > 0 ? 'var(--status-danger)' : 'var(--text-primary)' }}
            >
              {errorSyncs}
            </span>
            {errorSyncs > 0 ? (
              <button
                type="button"
                onClick={() => onNavigate('health')}
                className="text-[12px] font-medium hover:underline cursor-pointer"
                style={{ color: 'var(--status-danger)' }}
              >
                View errors
              </button>
            ) : (
              <span className="text-[12px] flex items-center gap-1" style={{ color: 'var(--status-success)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--status-success)' }} />
                Healthy
              </span>
            )}
          </div>
        </div>

        {/* Card 3 */}
        <div
          className="p-4 rounded-[6px] border space-y-1"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <span className="text-[12px] font-medium block" style={{ color: 'var(--text-muted)' }}>
            Records linked (7d)
          </span>
          <div className="flex items-baseline justify-between">
            <span
              className="text-[24px] font-semibold font-mono tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {recordsProcessed7d.toLocaleString()}
            </span>
            <span className="text-[12px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {runs.length} runs
            </span>
          </div>
        </div>

        {/* Card 4 */}
        <div
          className="p-4 rounded-[6px] border space-y-1"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <span className="text-[12px] font-medium block" style={{ color: 'var(--text-muted)' }}>
            Failure rate
          </span>
          <div className="flex items-baseline justify-between">
            <span
              className="text-[24px] font-semibold font-mono tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {failureRate}%
            </span>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {failureRate <= 5 ? 'Nominal' : 'Review'}
            </span>
          </div>
        </div>
      </div>

      {/* 7-Day Trend Chart Representation */}
      <div
        className="p-4 rounded-[6px] border"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-main)'
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Sync activity (past 7 days)
            </h2>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Daily synced records across all configured pipelines
            </span>
          </div>
          <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} /> Records
            </span>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="py-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
            No sync activity recorded in the past 7 days.
          </div>
        ) : (
          <div
            className="h-24 flex items-end gap-3 pt-3 border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {last7Days.map((bar, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <div
                  className="w-full max-w-[24px] rounded-t flex flex-col justify-end overflow-hidden h-full"
                  style={{ backgroundColor: 'var(--bg-raised)' }}
                >
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${bar.records > 0 ? Math.max(12, (bar.records / maxDayRecords) * 100) : 0}%`,
                      backgroundColor: 'var(--accent)'
                    }}
                    title={`${bar.records} records synced on ${bar.day}`}
                  />
                </div>
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  {bar.day}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Syncs Data Table Section */}
      <div
        className="rounded-[6px] border overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-main)'
        }}
      >
        {/* Table Filters & Search Bar */}
        <div
          className="p-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-main)' }}
        >
          {/* Segmented Control */}
          <div
            className="inline-flex items-center p-0.5 rounded-[6px] border self-start"
            style={{
              backgroundColor: 'var(--bg-raised)',
              borderColor: 'var(--border-main)'
            }}
          >
            {(['all', 'active', 'paused', 'error'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className="px-2.5 py-1 text-[12px] font-medium rounded-[4px] transition-colors capitalize cursor-pointer"
                style={{
                  backgroundColor: statusFilter === filter ? 'var(--bg-card)' : 'transparent',
                  color: statusFilter === filter ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: statusFilter === filter ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                {filter === 'all' ? 'All syncs' : filter}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-60">
            <Search
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Filter pipelines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 h-8 text-[12px] rounded-[6px] border focus:outline-hidden"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border-main)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>

        {/* Table Rows */}
        {filteredSyncs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Clock className="w-6 h-6 mx-auto" style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
              {searchQuery || statusFilter !== 'all'
                ? 'No matching sync pipelines found'
                : 'No syncs yet. Create your first sync.'}
            </h3>
            <p className="text-[12px] max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
              {searchQuery || statusFilter !== 'all'
                ? 'Try clearing your search query or status filter.'
                : 'Connect two data sources like Airtable and Google Sheets to keep records in sync.'}
            </p>
            <button
              type="button"
              onClick={onOpenWizard}
              className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-text)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent)';
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create first sync</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead
                className="border-b font-medium text-[12px]"
                style={{
                  backgroundColor: 'var(--bg-raised)',
                  borderColor: 'var(--border-main)',
                  color: 'var(--text-secondary)'
                }}
              >
                <tr>
                  <th className="py-2.5 px-4 font-medium">Pipeline & sources</th>
                  <th className="py-2.5 px-4 font-medium">Direction</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Cadence</th>
                  <th className="py-2.5 px-4 font-medium">Last run</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody
                className="divide-y"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                {filteredSyncs.map((sync) => {
                  const epA = getEndpoint(sync.endpointAId);
                  const epB = getEndpoint(sync.endpointBId);
                  const labelA = getConnectorName(epA?.connectorId || 'csv');
                  const labelB = getConnectorName(epB?.connectorId || 'mock_db');

                  const isRunning = runningSyncId === sync.id;

                  return (
                    <tr
                      key={sync.id}
                      onClick={() => onSelectSync(sync.id)}
                      className="transition-colors cursor-pointer"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* Name & Sources */}
                      <td className="py-2.5 px-4 min-w-[220px]">
                        <span
                          className="font-medium block truncate text-[13px]"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {sync.name}
                        </span>
                        <div
                          className="flex items-center gap-1.5 mt-0.5 text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span
                            className="px-1.5 py-0.2 rounded-[4px] border"
                            style={{
                              backgroundColor: 'var(--bg-card)',
                              borderColor: 'var(--border-main)'
                            }}
                          >
                            {labelA}
                          </span>
                          <span>→</span>
                          <span
                            className="px-1.5 py-0.2 rounded-[4px] border"
                            style={{
                              backgroundColor: 'var(--bg-card)',
                              borderColor: 'var(--border-main)'
                            }}
                          >
                            {labelB}
                          </span>
                        </div>
                      </td>

                      {/* Direction */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {sync.direction === 'two_way' ? (
                          <div
                            className="flex items-center gap-1.5 text-[12px] font-medium"
                            style={{ color: 'var(--accent)' }}
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                            <span>Two-way</span>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1.5 text-[12px] font-medium"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>One-way</span>
                          </div>
                        )}
                      </td>

                      {/* Status (Muted dot + text) */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium capitalize">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                sync.status === 'active'
                                  ? 'var(--status-success)'
                                  : sync.status === 'error'
                                  ? 'var(--status-danger)'
                                  : 'var(--status-warning)'
                            }}
                          />
                          <span style={{ color: 'var(--text-secondary)' }}>{sync.status}</span>
                        </span>
                      </td>

                      {/* Cadence */}
                      <td className="py-2.5 px-4 whitespace-nowrap text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                        {sync.triggerMode === 'webhook' ? (
                          <span style={{ color: 'var(--accent)' }}>Real-time</span>
                        ) : sync.triggerMode === 'scheduled' ? (
                          <span>Every {sync.intervalMinutes}m</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Manual</span>
                        )}
                      </td>

                      {/* Last Run */}
                      <td
                        className="py-2.5 px-4 whitespace-nowrap text-[12px] font-mono tabular-nums"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {sync.lastRunAt
                          ? new Date(sync.lastRunAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleRunNow(sync.id, e)}
                            disabled={isRunning}
                            className="h-7 px-2 text-[11px] font-medium rounded-[6px] border transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            style={{
                              backgroundColor: 'var(--bg-raised)',
                              borderColor: 'var(--border-main)',
                              color: 'var(--text-primary)'
                            }}
                            title="Run sync job now"
                          >
                            <Play className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
                            <span>{isRunning ? 'Running' : 'Run'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleTogglePause(sync, e)}
                            className="h-7 w-7 flex items-center justify-center rounded-[6px] transition-colors cursor-pointer"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                              e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = 'var(--text-muted)';
                            }}
                            title={sync.status === 'active' ? 'Pause sync' : 'Resume sync'}
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onSelectSync(sync.id)}
                            className="h-7 w-7 flex items-center justify-center rounded-[6px] transition-colors cursor-pointer"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                              e.currentTarget.style.color = 'var(--text-primary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = 'var(--text-muted)';
                            }}
                            title="View details & logs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
