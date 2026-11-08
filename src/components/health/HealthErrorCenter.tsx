import React, { useState } from 'react';
import { db } from '../../lib/db/store';
import {
  RotateCcw,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Zap
} from 'lucide-react';
import { SyncErrorRow } from '../../lib/db/schema';

interface HealthErrorCenterProps {
  onNavigate: (view: string) => void;
  onRefresh: () => void;
}

export const HealthErrorCenter: React.FC<HealthErrorCenterProps> = ({ onNavigate, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'errors' | 'dead_letters'>('errors');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const errors = db.getErrors();
  const deadLetters = db.getDeadLetters();

  const unresolvedErrors = errors.filter((e) => !e.isResolved);
  const openDeadLetters = deadLetters.filter((d) => d.status === 'open');

  const handleFixAction = (err: SyncErrorRow) => {
    if (err.category === 'auth') {
      onNavigate('connections');
    } else {
      onNavigate('dashboard');
    }
  };

  const handleResolveError = (errId: string) => {
    const err = errors.find((e) => e.id === errId);
    if (err) {
      err.isResolved = true;
      err.updatedAt = new Date().toISOString();
      setActionNotice('Error marked as resolved.');
      onRefresh();
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleReplayDeadLetter = (dlId: string) => {
    const ok = db.replayDeadLetter(dlId);
    if (ok) {
      setActionNotice('Event payload requeued for execution.');
      onRefresh();
      setTimeout(() => setActionNotice(null), 3000);
    }
  };

  const handleBulkReplay = () => {
    const count = db.bulkReplayDeadLetters();
    setActionNotice(`Bulk replayed ${count} dead-letter events.`);
    onRefresh();
    setTimeout(() => setActionNotice(null), 3000);
  };

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[24px] font-semibold text-[var(--text-primary)] tracking-tight">
            Sync health & errors
          </h1>
          {unresolvedErrors.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-main)] text-[12px] font-medium text-[var(--status-danger)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-danger)]" />
              {unresolvedErrors.length} active
            </span>
          )}
        </div>
        <p className="text-[14px] text-[var(--text-muted)] mt-1">
          Root cause analysis, human-readable diagnostics, and dead-letter queue replay tooling.
        </p>
      </div>

      {actionNotice && (
        <div className="p-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] font-medium text-[var(--text-primary)] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Segmented Tab Bar */}
      <div className="inline-flex p-0.5 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px]">
        <button
          onClick={() => setActiveTab('errors')}
          className={`h-7 px-3 text-[12px] font-medium rounded-[4px] transition-colors ${
            activeTab === 'errors'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Active errors ({unresolvedErrors.length})
        </button>
        <button
          onClick={() => setActiveTab('dead_letters')}
          className={`h-7 px-3 text-[12px] font-medium rounded-[4px] transition-colors ${
            activeTab === 'dead_letters'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Dead-letter queue ({openDeadLetters.length})
        </button>
      </div>

      {/* ERRORS TAB */}
      {activeTab === 'errors' && (
        <div className="space-y-3">
          {errors.length === 0 ? (
            <div className="bg-[var(--bg-card)] p-12 rounded-[6px] border border-[var(--border-main)] text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-[var(--status-success)] mx-auto" />
              <h4 className="font-semibold text-[var(--text-primary)] text-[14px]">All integrations healthy</h4>
              <p className="text-[12px] text-[var(--text-muted)]">Zero active errors across your sync pipelines.</p>
            </div>
          ) : (
            errors.map((err) => (
              <div
                key={err.id}
                className={`p-4 rounded-[6px] border bg-[var(--bg-card)] space-y-3 transition-colors ${
                  err.isResolved ? 'opacity-60 border-[var(--border-subtle)]' : 'border-[var(--border-main)]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[11px] px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono uppercase">
                        {err.category}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">{err.code}</span>
                      {err.isResolved && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--status-success)] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)]" />
                          Resolved
                        </span>
                      )}
                    </div>
                    <h3 className="text-[14px] font-medium text-[var(--text-primary)]">{err.userMessage}</h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!err.isResolved && (
                      <button
                        onClick={() => handleResolveError(err.id)}
                        className="h-8 px-3 text-[12px] font-medium border border-[var(--border-main)] rounded-[6px] hover:bg-[var(--bg-raised)] text-[var(--text-secondary)] transition-colors"
                      >
                        Mark resolved
                      </button>
                    )}
                    <button
                      onClick={() => handleFixAction(err)}
                      className="h-8 px-3 text-[12px] font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] flex items-center gap-1.5 transition-colors"
                    >
                      <span>Fix this</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {err.fixHint && (
                  <div className="p-3 bg-[var(--bg-raised)] rounded-[6px] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>
                      <strong className="text-[var(--text-primary)]">Suggested fix:</strong> {err.fixHint}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* DEAD-LETTER QUEUE TAB */}
      {activeTab === 'dead_letters' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-[var(--text-muted)]">
              Records that exhausted all retry attempts. Once mappings or vendor credentials are fixed, replay them individually or in bulk.
            </p>
            {openDeadLetters.length > 0 && (
              <button
                onClick={handleBulkReplay}
                className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Replay all open dead letters</span>
              </button>
            )}
          </div>

          {deadLetters.length === 0 ? (
            <div className="bg-[var(--bg-card)] p-12 rounded-[6px] border border-[var(--border-main)] text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-[var(--status-success)] mx-auto" />
              <h4 className="font-semibold text-[var(--text-primary)] text-[14px]">Dead-letter queue is empty</h4>
              <p className="text-[12px] text-[var(--text-muted)]">No failed events awaiting manual replay.</p>
            </div>
          ) : (
            <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)]">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Event ID</th>
                    <th className="py-2.5 px-3 text-right">Attempts</th>
                    <th className="py-2.5 px-3">Vendor last error</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                  {deadLetters.map((dl) => (
                    <tr key={dl.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                      <td className="py-2.5 px-3 font-medium text-[var(--text-primary)]">{dl.id}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-secondary)] font-sans">
                        {dl.attempts} / 6
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[var(--status-danger)] max-w-sm truncate">
                        {dl.lastError}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="inline-flex items-center gap-1.5 text-[12px]">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              dl.status === 'open' ? 'bg-[var(--status-danger)]' : 'bg-[var(--status-success)]'
                            }`}
                          />
                          <span className="capitalize text-[var(--text-secondary)]">{dl.status}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          {dl.status === 'open' && (
                            <button
                              onClick={() => handleReplayDeadLetter(dl.id)}
                              className="h-7 px-2.5 text-[12px] font-medium bg-[var(--accent)] text-white rounded-[6px] hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" /> Replay
                            </button>
                          )}
                          <button
                            onClick={() => {
                              dl.status = 'dismissed';
                              onRefresh();
                            }}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-[4px] hover:bg-[var(--bg-raised)] transition-colors"
                            title="Dismiss event"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
