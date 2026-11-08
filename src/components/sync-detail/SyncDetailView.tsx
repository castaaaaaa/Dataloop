import React, { useState } from 'react';
import { db } from '../../lib/db/store';
import { useAuth } from '../../lib/auth/AuthContext';
import {
  ArrowLeft,
  Play,
  Pause,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { SyncConfigRow, SyncEventRow, FieldMappingRow, SyncRunRow } from '../../lib/db/schema';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface SyncDetailViewProps {
  syncId: string;
  onBack: () => void;
  onRefresh: () => void;
}

export const SyncDetailView: React.FC<SyncDetailViewProps> = ({ syncId, onBack, onRefresh }) => {
  const { user, session } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'mapping' | 'runs' | 'conflicts' | 'settings'>('overview');
  const [isRunning, setIsRunning] = useState(false);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const [dbSync, setDbSync] = useState<SyncConfigRow | null>(null);
  const [dbMappings, setDbMappings] = useState<FieldMappingRow[]>([]);
  const [dbRuns, setDbRuns] = useState<SyncRunRow[]>([]);
  const [loadingSync, setLoadingSync] = useState(true);

  const fetchSyncData = React.useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (user?.id) headers['x-user-id'] = user.id;

      const res = await fetch(`/api/v1/syncs/${syncId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.sync) setDbSync(data.sync);
        if (Array.isArray(data.mappings)) setDbMappings(data.mappings);
        if (Array.isArray(data.recentRuns)) setDbRuns(data.recentRuns);
      }
    } catch (e) {
      console.error('[SyncDetailView] Error loading sync from API:', e);
    } finally {
      setLoadingSync(false);
    }
  }, [syncId, session, user]);

  React.useEffect(() => {
    fetchSyncData();
  }, [fetchSyncData]);

  const sync = dbSync || db.getSyncConfigById(syncId);
  const endpoints = db.getDataEndpoints();
  const mappings = dbMappings.length > 0 ? dbMappings : db.getFieldMappings(syncId);

  // Combine runs: DB runs take precedence, merged with any local memory runs
  const memoryRuns = db.getSyncRuns(syncId);
  const allRuns = [...dbRuns];
  for (const mr of memoryRuns) {
    if (!allRuns.some((r) => r.id === mr.id)) {
      allRuns.push(mr);
    }
  }
  const runs = allRuns.length > 0 ? allRuns : memoryRuns;
  const conflicts = db.getConflicts().filter((c) => c.syncConfigId === syncId);
  const recordLinks = db.getRecordLinks(syncId);

  // Poll while any run is in 'running' or 'queued' status
  React.useEffect(() => {
    const hasRunning = runs.some((r) => r.status === 'running' || r.status === 'queued');
    if (!hasRunning) return;

    const timer = setInterval(() => {
      fetchSyncData();
      onRefresh();
    }, 2000);

    return () => clearInterval(timer);
  }, [runs, onRefresh, fetchSyncData]);

  if (loadingSync && !sync) {
    return (
      <div className="max-w-[1100px] mx-auto p-12 text-center space-y-3">
        <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-[12px] text-[var(--text-muted)]">Loading sync pipeline from database...</p>
      </div>
    );
  }

  if (!sync) {
    return (
      <div className="max-w-[1100px] mx-auto p-6 text-center space-y-3">
        <p className="text-[14px] text-[var(--text-muted)]">Pipeline not found in database.</p>
        <button
          onClick={onBack}
          className="h-8 px-3 bg-[var(--accent)] text-white rounded-[6px] text-[12px] font-medium cursor-pointer"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const endpointA = endpoints.find((e) => e.id === sync.endpointAId);
  const endpointB = endpoints.find((e) => e.id === sync.endpointBId);

  const handleRunNow = async () => {
    setIsRunning(true);
    setNotification(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (user?.id) headers['x-user-id'] = user.id;

      const res = await fetch(`/api/v1/syncs/${sync.id}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ isDryRun: false })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Sync run failed to start');
      }

      const data = await res.json();
      setNotification(`Background sync job started (${data.runId}). Live progress updating below.`);
      setActiveTab('runs');
      await fetchSyncData();
      onRefresh();
    } catch (err: any) {
      setNotification(`Execution error: ${err.message || String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRetryFailed = async (runId: string) => {
    setIsRetrying(runId);
    setNotification(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (user?.id) headers['x-user-id'] = user.id;

      const res = await fetch(`/api/v1/runs/${runId}/retry-failed`, {
        method: 'POST',
        headers
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Retry job failed to start');
      }

      const data = await res.json();
      setNotification(`Retry background job started (${data.runId}) for failed records.`);
      onRefresh();
    } catch (err: any) {
      setNotification(`Retry error: ${err.message || String(err)}`);
    } finally {
      setIsRetrying(null);
    }
  };

  const handleTogglePause = () => {
    sync.status = sync.status === 'active' ? 'paused' : 'active';
    sync.updatedAt = new Date().toISOString();
    db.logAudit(`sync.${sync.status}`, 'sync_config', sync.id);
    onRefresh();
  };

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-6">
      {/* Back Button & Top Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePause}
            className="h-8 px-3 border border-[var(--border-main)] rounded-[6px] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] transition-colors flex items-center gap-1.5"
          >
            {sync.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{sync.status === 'active' ? 'Pause sync' : 'Resume sync'}</span>
          </button>

          <button
            onClick={handleRunNow}
            disabled={isRunning}
            className="h-8 px-3.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Running job...' : 'Run sync now'}</span>
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="p-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] font-medium text-[var(--text-primary)] flex items-center justify-between">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="text-[var(--accent)] hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Title & Connector Header */}
      <div className="bg-[var(--bg-card)] p-6 rounded-[6px] border border-[var(--border-main)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold text-[var(--text-primary)] tracking-tight">{sync.name}</h1>
              <span className="inline-flex items-center gap-1.5 text-[12px]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    sync.status === 'active' ? 'bg-[var(--status-success)]' : 'bg-[var(--border-main)]'
                  }`}
                />
                <span className="capitalize text-[var(--text-secondary)] font-medium">{sync.status}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)] mt-1">
              <span>Cadence: Every {sync.intervalMinutes}m</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">
                Conflict rule: {String(sync.conflictRule ?? '').replace(/_/g, ' ') || 'source wins'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{recordLinks.length} active record links</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-[var(--bg-raised)] px-3 py-2 rounded-[6px] border border-[var(--border-subtle)] text-[12px]">
            <span className="font-medium text-[var(--text-primary)]">{endpointA?.objectRef.name || 'Source'}</span>
            {sync.direction === 'two_way' ? (
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--accent)]" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            )}
            <span className="font-medium text-[var(--text-primary)]">{endpointB?.objectRef.name || 'Destination'}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-t border-[var(--border-subtle)] pt-3 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'mapping', label: `Field mappings (${mappings.length})` },
            { id: 'runs', label: `Execution history (${runs.length})` },
            { id: 'conflicts', label: `Conflicts (${conflicts.length})` },
            { id: 'settings', label: 'Pipeline settings' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`h-7 px-3 text-[12px] font-medium rounded-[4px] transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-raised)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="bg-[var(--bg-card)] p-5 rounded-[6px] border border-[var(--border-main)] space-y-3">
              <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Sync architecture & health
              </h3>
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                This pipeline keeps records synchronized with hash-based change detection and loop prevention.
                Incoming updates are evaluated against existing record links before triggering external writes.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2 text-[12px]">
                <div className="p-3 bg-[var(--bg-raised)] rounded-[6px] border border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">Delete behavior</span>
                  <span className="font-medium text-[var(--text-primary)] capitalize">
                    {String(sync.deleteBehavior ?? '').replace(/_/g, ' ') || 'ignore'}
                  </span>
                </div>
                <div className="p-3 bg-[var(--bg-raised)] rounded-[6px] border border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">Trigger mode</span>
                  <span className="font-medium text-[var(--text-primary)] capitalize">{sync.triggerMode}</span>
                </div>
              </div>
            </div>

            {/* Recent Runs Mini Table */}
            <div className="bg-[var(--bg-card)] rounded-[6px] border border-[var(--border-main)] overflow-hidden">
              <div className="p-3 border-b border-[var(--border-subtle)] font-medium text-[var(--text-primary)] text-[12px]">
                Latest execution runs
              </div>
              {runs.length === 0 ? (
                <div className="p-8 text-center text-[12px] text-[var(--text-muted)]">
                  No sync runs recorded yet. Click <strong>Run sync now</strong> above to trigger the first run.
                </div>
              ) : (
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Run ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Created</th>
                      <th className="py-2.5 px-3 text-right">Updated</th>
                      <th className="py-2.5 px-3 text-right">Skipped</th>
                      <th className="py-2.5 px-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                    {runs.slice(0, 4).map((r) => (
                      <tr key={r.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                        <td className="py-2.5 px-3 text-[var(--text-primary)]">{r.id}</td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                r.status === 'succeeded' ? 'bg-[var(--status-success)]' : 'bg-[var(--status-danger)]'
                              }`}
                            />
                            <span className="capitalize text-[var(--text-secondary)]">{r.status}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-[var(--text-secondary)] font-sans">{r.created}</td>
                        <td className="py-2.5 px-3 text-right text-[var(--text-secondary)] font-sans">{r.updated}</td>
                        <td className="py-2.5 px-3 text-right text-[var(--text-muted)] font-sans">{r.skipped}</td>
                        <td className="py-2.5 px-3 text-right text-[var(--text-muted)] font-sans">
                          {new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right Column: Linked Record State */}
          <div className="space-y-4">
            <div className="bg-[var(--bg-card)] p-5 rounded-[6px] border border-[var(--border-main)] space-y-3">
              <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Active record links
              </h3>
              <div className="text-[24px] font-semibold font-mono text-[var(--text-primary)]">
                {recordLinks.length}
              </div>
              <p className="text-[12px] text-[var(--text-muted)]">
                Cross-system unique identifiers mapped and monitored for bidirectional changes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MAPPING */}
      {activeTab === 'mapping' && (
        <ErrorBoundary
          fallback={
            <div className="bg-[var(--bg-card)] p-6 rounded-[6px] border border-[var(--border-main)] text-center space-y-2">
              <div className="flex items-center justify-center gap-1.5 text-[var(--status-danger)] text-[13px] font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Unable to display field mappings</span>
              </div>
              <p className="text-[12px] text-[var(--text-muted)]">
                A mapping definition could not be rendered. Check configuration in database.
              </p>
            </div>
          }
        >
          <div className="bg-[var(--bg-card)] rounded-[6px] border border-[var(--border-main)] overflow-hidden">
            {mappings.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-[var(--text-muted)]">
                No field mappings configured for this sync pipeline.
              </div>
            ) : (
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Correlation key</th>
                    <th className="py-2.5 px-3">Source field</th>
                    <th className="py-2.5 px-3">Transformation</th>
                    <th className="py-2.5 px-3">Destination field</th>
                    <th className="py-2.5 px-3 text-right">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                  {mappings.map((m: any, idx: number) => {
                    const isKey = Boolean(m.isKey ?? m.is_key);
                    const sourceField = String(
                      m.sourceFieldKey ?? m.source_field_key ?? m.sourceField ?? m.sourceColumn ?? m.source ?? ''
                    ).trim();
                    const destField = String(
                      m.destinationFieldKey ?? m.destination_field_key ?? m.destField ?? m.destinationColumn ?? m.destination ?? ''
                    ).trim();

                    let transformText = 'Direct passthrough';
                    if (m.transform) {
                      if (typeof m.transform === 'string' && m.transform.trim()) {
                        transformText = String(m.transform).replace(/_/g, ' ');
                      } else if (typeof m.transform === 'object' && m.transform.type) {
                        transformText = String(m.transform.type ?? '').replace(/_/g, ' ') || 'Direct passthrough';
                      }
                    }

                    const isRequired = Boolean(m.required);

                    return (
                      <tr key={m.id || `map_${idx}`} className="hover:bg-[var(--bg-raised)] transition-colors">
                        <td className="py-2.5 px-3">
                          {isKey ? (
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--accent)] font-medium">
                              Primary key
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[var(--text-primary)]">
                          {sourceField || <span className="text-[var(--text-muted)] italic font-sans">(not set)</span>}
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          {transformText !== 'Direct passthrough' ? (
                            <span className="text-[var(--text-secondary)]">{transformText}</span>
                          ) : (
                            <span className="text-[var(--text-muted)]">Direct passthrough</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[var(--text-primary)]">
                          {destField || <span className="text-[var(--text-muted)] italic font-sans">(not set)</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right font-sans">
                          {isRequired ? (
                            <span className="text-[var(--status-danger)] font-medium">Required</span>
                          ) : (
                            <span className="text-[var(--text-muted)]">Optional</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </ErrorBoundary>
      )}

      {/* TAB CONTENT: RUNS */}
      {activeTab === 'runs' && (
        <div className="bg-[var(--bg-card)] rounded-[6px] border border-[var(--border-main)] overflow-hidden">
          {runs.length === 0 ? (
            <div className="p-12 text-center text-[12px] text-[var(--text-muted)] space-y-3">
              <Clock className="w-6 h-6 text-[var(--text-muted)] mx-auto" />
              <h4 className="font-semibold text-[var(--text-primary)] text-[14px]">No sync runs recorded yet</h4>
              <p className="max-w-sm mx-auto">
                This pipeline has not executed any sync runs yet. Click "Run sync now" to trigger the first run.
              </p>
              <button
                onClick={handleRunNow}
                disabled={isRunning}
                className="mt-2 h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium cursor-pointer"
              >
                Run sync now
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Run ID</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Read</th>
                    <th className="py-2.5 px-3 text-right">Created</th>
                    <th className="py-2.5 px-3 text-right">Updated</th>
                    <th className="py-2.5 px-3 text-right">Skipped</th>
                    <th className="py-2.5 px-3 text-right">Failed</th>
                    <th className="py-2.5 px-3 text-right">Started at</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                  {runs.map((r) => {
                    const isExpanded = expandedRunId === r.id;
                    const events = db.getSyncEvents(r.id);

                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          onClick={() => setExpandedRunId(isExpanded ? null : r.id)}
                          className="hover:bg-[var(--bg-raised)] transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium">
                            <div className="flex items-center gap-1.5">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                              )}
                              <span>{r.id}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  r.status === 'succeeded'
                                    ? 'bg-[var(--status-success)]'
                                    : r.status === 'running'
                                    ? 'bg-[var(--accent)] animate-pulse'
                                    : 'bg-[var(--status-danger)]'
                                }`}
                              />
                              <span className="capitalize text-[var(--text-secondary)]">{r.status}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans text-[var(--text-secondary)]">{r.recordsRead}</td>
                          <td className="py-2.5 px-3 text-right font-sans font-medium text-[var(--status-success)]">{r.created}</td>
                          <td className="py-2.5 px-3 text-right font-sans font-medium text-[var(--text-primary)]">{r.updated}</td>
                          <td className="py-2.5 px-3 text-right font-sans text-[var(--text-muted)]">{r.skipped}</td>
                          <td className="py-2.5 px-3 text-right font-sans">
                            {r.failed > 0 ? (
                              <span className="font-semibold text-[var(--status-danger)]">{r.failed}</span>
                            ) : (
                              <span className="text-[var(--text-muted)]">0</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-[var(--text-muted)] font-sans">
                            {new Date(r.startedAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans" onClick={(e) => e.stopPropagation()}>
                            {(r.failed > 0 || r.status === 'failed') && (
                              <button
                                type="button"
                                onClick={() => handleRetryFailed(r.id)}
                                disabled={isRetrying === r.id || r.status === 'running'}
                                className="inline-flex items-center gap-1 h-6 px-2 text-[11px] font-medium rounded-[4px] border border-[var(--border-main)] hover:bg-[var(--bg-raised)] text-[var(--status-warning)] transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <RotateCcw className={`w-3 h-3 ${isRetrying === r.id ? 'animate-spin' : ''}`} />
                                <span>Retry failed</span>
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Per-Record Events Sub-Panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="p-0 bg-[var(--bg-raised)] border-b border-[var(--border-main)]">
                              <div className="p-4 space-y-3 font-sans">
                                {r.errorMessage && (
                                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-[4px] text-[12px] text-rose-500 flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-semibold">Execution Error</div>
                                      <div className="text-[11px] font-mono break-all">{r.errorMessage}</div>
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center justify-between">
                                  <h5 className="text-[12px] font-semibold text-[var(--text-primary)]">
                                    Per-Record Event Stream ({events.length} events)
                                  </h5>
                                  <span className="text-[11px] text-[var(--text-muted)]">
                                    Click any row to collapse
                                  </span>
                                </div>

                                {events.length === 0 ? (
                                  <div className="text-[12px] text-[var(--text-muted)] py-2">
                                    No granular record events logged for this execution.
                                  </div>
                                ) : (
                                  <div className="border border-[var(--border-subtle)] rounded-[4px] overflow-hidden bg-[var(--bg-card)]">
                                    <table className="w-full text-left text-[11px]">
                                      <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-medium">
                                        <tr>
                                          <th className="py-1.5 px-2.5">Time</th>
                                          <th className="py-1.5 px-2.5">Action</th>
                                          <th className="py-1.5 px-2.5">Source Key</th>
                                          <th className="py-1.5 px-2.5">Destination ID</th>
                                          <th className="py-1.5 px-2.5">Idempotency Key</th>
                                          <th className="py-1.5 px-2.5">Outcome / Plain-English Note</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                                        {events.map((ev) => (
                                          <tr key={ev.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                                            <td className="py-1.5 px-2.5 text-[var(--text-muted)] font-sans">
                                              {new Date(ev.createdAt).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                              })}
                                            </td>
                                            <td className="py-1.5 px-2.5 font-sans">
                                              <span
                                                className={`inline-block px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium uppercase ${
                                                  ev.status === 'failed'
                                                    ? 'bg-rose-500/10 text-rose-500'
                                                    : ev.action === 'create'
                                                    ? 'bg-emerald-500/10 text-emerald-500'
                                                    : ev.action === 'update'
                                                    ? 'bg-blue-500/10 text-blue-500'
                                                    : 'bg-zinc-500/10 text-zinc-400'
                                                }`}
                                              >
                                                {ev.status === 'failed' ? 'failed' : ev.action}
                                              </span>
                                            </td>
                                            <td className="py-1.5 px-2.5 text-[var(--text-primary)]">
                                              {ev.recordLinkId || '—'}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-[var(--text-secondary)]">
                                              Side {ev.side}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-[10px] text-[var(--text-muted)] truncate max-w-[200px]" title={ev.idempotencyKey}>
                                              {ev.idempotencyKey || '—'}
                                            </td>
                                            <td className="py-1.5 px-2.5 font-sans text-[var(--text-secondary)]">
                                              {ev.status === 'failed' ? (
                                                <span className="text-[var(--status-danger)] flex items-center gap-1">
                                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                                  <span>{ev.message || 'Write operation failed with error'}</span>
                                                </span>
                                              ) : ev.message ? (
                                                <span>{ev.message}</span>
                                              ) : ev.action === 'skip' ? (
                                                <span className="text-[var(--text-muted)]">
                                                  Record skipped: unchanged hash
                                                </span>
                                              ) : ev.action === 'create' ? (
                                                <span className="text-[var(--status-success)]">
                                                  New row created in destination
                                                </span>
                                              ) : (
                                                <span>Existing row updated with source values</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: CONFLICTS */}
      {activeTab === 'conflicts' && (
        <div className="bg-[var(--bg-card)] p-6 rounded-[6px] border border-[var(--border-main)]">
          {conflicts.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <CheckCircle2 className="w-6 h-6 text-[var(--status-success)] mx-auto" />
              <h4 className="font-semibold text-[var(--text-primary)] text-[14px]">No pending conflicts</h4>
              <p className="text-[12px] text-[var(--text-muted)]">
                Both endpoints are synchronized without ambiguous changes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[12px] text-[var(--text-muted)]">
                The following records have differing values on both sides. Resolve them directly in the Review Queue.
              </p>
              {conflicts.map((c) => (
                <div key={c.id} className="p-4 border border-[var(--border-main)] bg-[var(--bg-raised)] rounded-[6px] space-y-2">
                  <div className="flex items-center justify-between text-[12px] font-medium text-[var(--text-primary)]">
                    <span>Conflict #{c.id}</span>
                    <span className="text-[var(--status-warning)]">Awaiting decision</span>
                  </div>
                  <pre className="text-[11px] font-mono bg-[var(--bg-card)] p-3 rounded-[4px] border border-[var(--border-subtle)] text-[var(--text-secondary)] overflow-x-auto">
                    {JSON.stringify({ source: c.aValue, destination: c.bValue }, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-[var(--bg-card)] p-6 rounded-[6px] border border-[var(--border-main)] space-y-6">
          <div>
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Pipeline configuration</h3>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              Modify triggers, delete rules, or archive this pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12px]">
            <div>
              <label className="font-medium text-[var(--text-secondary)] block mb-1">Execution cadence</label>
              <select
                value={sync.intervalMinutes}
                onChange={(e) => {
                  sync.intervalMinutes = parseInt(e.target.value, 10);
                  sync.updatedAt = new Date().toISOString();
                  onRefresh();
                }}
                className="w-full h-8 px-2.5 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value={5}>Every 5 minutes</option>
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every 60 minutes</option>
              </select>
            </div>

            <div>
              <label className="font-medium text-[var(--text-secondary)] block mb-1">Delete propagation</label>
              <select
                value={sync.deleteBehavior}
                onChange={(e) => {
                  sync.deleteBehavior = e.target.value as any;
                  sync.updatedAt = new Date().toISOString();
                  onRefresh();
                }}
                className="w-full h-8 px-2.5 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="ignore">Ignore deletes (safe)</option>
                <option value="soft_delete">Soft delete (archive)</option>
                <option value="hard_delete">Hard delete (permanent)</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
