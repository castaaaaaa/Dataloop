import React, { useState } from 'react';
import { db } from '../../lib/db/store';
import { Shield } from 'lucide-react';

export const ActivityView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'events' | 'audit'>('events');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const events = db.getSyncEvents();
  const auditLogs = db.auditLogs.filter((a) => a.workspaceId === db.currentWorkspaceId);

  const filteredEvents = events.filter((e) => {
    if (filterAction !== 'all' && e.action !== filterAction) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        e.idempotencyKey.toLowerCase().includes(q) ||
        (e.message && e.message.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const filteredAudit = auditLogs.filter((a) => {
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        a.action.toLowerCase().includes(q) ||
        (a.actorEmail && a.actorEmail.toLowerCase().includes(q)) ||
        a.targetType.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-semibold text-[var(--text-primary)] tracking-tight">
          Activity & logs
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] mt-1">
          Detailed trace logs of record-level sync events, idempotency keys, and security audit trails.
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex p-0.5 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px]">
        <button
          onClick={() => setActiveTab('events')}
          className={`h-7 px-3 text-[12px] font-medium rounded-[4px] transition-colors ${
            activeTab === 'events'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Record sync events ({events.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`h-7 px-3 text-[12px] font-medium rounded-[4px] transition-colors ${
            activeTab === 'audit'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          Security audit logs ({auditLogs.length})
        </button>
      </div>

      {/* SYNC EVENTS TAB */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="p-3 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] text-[var(--text-muted)] font-medium mr-1">Filter action:</span>
              {(['all', 'create', 'update', 'delete', 'conflict', 'skip'] as const).map((act) => (
                <button
                  key={act}
                  onClick={() => setFilterAction(act)}
                  className={`h-7 px-2.5 text-[12px] rounded-[4px] capitalize font-medium transition-colors ${
                    filterAction === act
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {act}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search key or message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 px-3 text-[12px] bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)]">
            {filteredEvents.length === 0 ? (
              <div className="p-12 text-center text-[12px] text-[var(--text-muted)]">
                No events match the selected criteria.
              </div>
            ) : (
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Side & action</th>
                    <th className="py-2.5 px-3">Idempotency key</th>
                    <th className="py-2.5 px-3">Outcome</th>
                    <th className="py-2.5 px-3">Message</th>
                    <th className="py-2.5 px-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                  {filteredEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                          Side {evt.side} · <span className="text-[var(--text-primary)]">{evt.action}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)] text-[11px] truncate max-w-xs">
                        {evt.idempotencyKey}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="inline-flex items-center gap-1.5 text-[12px]">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              evt.status === 'succeeded' ? 'bg-[var(--status-success)]' : 'bg-[var(--status-danger)]'
                            }`}
                          />
                          <span className="capitalize text-[var(--text-secondary)]">{evt.status}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[var(--text-secondary)]">{evt.message || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-[var(--text-muted)] font-sans">
                        {new Date(evt.createdAt || (evt as any).timestamp || Date.now()).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SECURITY AUDIT LOGS TAB */}
      {activeTab === 'audit' && (
        <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)]">
          {filteredAudit.length === 0 ? (
            <div className="p-12 text-center text-[12px] text-[var(--text-muted)] space-y-2">
              <Shield className="w-6 h-6 text-[var(--text-muted)] mx-auto" />
              <h4 className="font-semibold text-[var(--text-primary)] text-[14px]">No audit logs yet</h4>
              <p className="text-[var(--text-muted)] max-w-sm mx-auto">
                Security-sensitive workspace activities such as creating pipelines, connecting accounts, or rotating API keys will be tracked here.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action event</th>
                  <th className="py-2.5 px-3">Target type</th>
                  <th className="py-2.5 px-3 text-right">IP address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                {filteredAudit.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                    <td className="py-2.5 px-3 text-[var(--text-muted)] font-sans">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-[var(--text-primary)] font-medium">
                      {log.actorEmail || 'system@dataloop.io'}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--accent)] font-medium">{log.action}</td>
                    <td className="py-2.5 px-3 font-sans text-[var(--text-secondary)]">{log.targetType}</td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-muted)]">{log.ip || '198.51.100.14'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
