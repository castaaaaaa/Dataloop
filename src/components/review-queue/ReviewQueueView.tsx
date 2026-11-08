import React, { useState } from 'react';
import { db } from '../../lib/db/store';
import { Check, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ConflictRow } from '../../lib/db/schema';

interface ReviewQueueViewProps {
  onRefresh: () => void;
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({ onRefresh }) => {
  const [selectedConflictIndex, setSelectedConflictIndex] = useState(0);
  const [customFieldPicks, setCustomFieldPicks] = useState<Record<string, 'A' | 'B'>>({});
  const [resolvedNotification, setResolvedNotification] = useState<string | null>(null);

  const conflicts = db.getConflicts();
  const currentConflict: ConflictRow | undefined = conflicts[selectedConflictIndex];
  const currentSync = currentConflict ? db.getSyncConfigById(currentConflict.syncConfigId) : undefined;
  const endpointA = currentSync ? db.getDataEndpoints().find((e) => e.id === currentSync.endpointAId) : undefined;
  const endpointB = currentSync ? db.getDataEndpoints().find((e) => e.id === currentSync.endpointBId) : undefined;
  const sourceName = endpointA?.objectRef.name || 'Source (A)';
  const destName = endpointB?.objectRef.name || 'Destination (B)';

  const handleResolve = (resolution: 'use_a' | 'use_b' | 'custom') => {
    if (!currentConflict) return;

    let customPayload: Record<string, unknown> | undefined;
    if (resolution === 'custom') {
      customPayload = {};
      const allKeys = Array.from(
        new Set([...Object.keys(currentConflict.aValue), ...Object.keys(currentConflict.bValue)])
      );
      for (const k of allKeys) {
        const pick = customFieldPicks[k] || 'A';
        customPayload[k] = pick === 'A' ? currentConflict.aValue[k] : currentConflict.bValue[k];
      }
    }

    db.resolveConflict(currentConflict.id, resolution, customPayload);
    setResolvedNotification(`Conflict resolved using ${resolution.replace('_', ' ')}.`);
    onRefresh();
    setTimeout(() => setResolvedNotification(null), 4000);
  };

  const handleApplyToAllSimilar = (resolution: 'use_a' | 'use_b') => {
    conflicts.forEach((c) => {
      db.resolveConflict(c.id, resolution);
    });
    setResolvedNotification(`Applied ${resolution.replace('_', ' ')} to all ${conflicts.length} conflicts.`);
    onRefresh();
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6 font-sans">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1
            className="text-[24px] font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Review queue
          </h1>
          {conflicts.length > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] border text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border-main)',
                color: 'var(--status-warning)'
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--status-warning)' }} />
              {conflicts.length} pending
            </span>
          )}
        </div>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Review concurrent updates across two-way pipelines.
        </p>
      </div>

      {resolvedNotification && (
        <div
          className="p-3 rounded-[6px] border flex items-center gap-2 text-[12px]"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--status-success)',
            color: 'var(--text-primary)'
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--status-success)' }} />
          <span>{resolvedNotification}</span>
        </div>
      )}

      {conflicts.length === 0 ? (
        <div
          className="p-12 rounded-[6px] border text-center space-y-2"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <Check className="w-6 h-6 mx-auto" style={{ color: 'var(--status-success)' }} />
          <h3 className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
            Review queue is empty
          </h3>
          <p className="text-[12px] max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            All records across connected endpoints are synchronized without concurrent conflicts.
          </p>
        </div>
      ) : (
        <div
          className="rounded-[6px] border overflow-hidden space-y-6"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          {/* Conflict Selector Header */}
          <div
            className="p-3.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[12px]"
            style={{
              backgroundColor: 'var(--bg-raised)',
              borderColor: 'var(--border-main)'
            }}
          >
            <div className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
              <span className="font-medium">
                Conflict {selectedConflictIndex + 1} of {conflicts.length}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Record #{currentConflict?.recordLinkId}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApplyToAllSimilar('use_a')}
                className="h-7 px-2 text-[11px] font-medium rounded-[6px] border transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-main)',
                  color: 'var(--text-secondary)'
                }}
              >
                Keep source for all
              </button>
              <button
                type="button"
                onClick={() => handleApplyToAllSimilar('use_b')}
                className="h-7 px-2 text-[11px] font-medium rounded-[6px] border transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-main)',
                  color: 'var(--text-secondary)'
                }}
              >
                Keep destination for all
              </button>
            </div>
          </div>

          {/* Side-by-Side Comparison Grid */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Version A (Source) */}
              <div
                className="p-4 rounded-[6px] border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-raised)',
                  borderColor: 'var(--border-main)'
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    Version A ({sourceName})
                  </span>
                  <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {new Date(currentConflict?.createdAt || '').toLocaleTimeString()}
                  </span>
                </div>
                <div
                  className="p-3 rounded-[6px] border font-mono text-[11px] overflow-x-auto space-y-1"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {Object.entries(currentConflict?.aValue || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleResolve('use_a')}
                  className="w-full h-8 px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-text)'
                  }}
                >
                  Accept Version A
                </button>
              </div>

              {/* Version B (Destination) */}
              <div
                className="p-4 rounded-[6px] border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-raised)',
                  borderColor: 'var(--border-main)'
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    Version B ({destName})
                  </span>
                  <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {new Date(currentConflict?.createdAt || '').toLocaleTimeString()}
                  </span>
                </div>
                <div
                  className="p-3 rounded-[6px] border font-mono text-[11px] overflow-x-auto space-y-1"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {Object.entries(currentConflict?.bValue || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handleResolve('use_b')}
                  className="w-full h-8 px-3 text-[12px] font-medium rounded-[6px] border transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-main)',
                    color: 'var(--text-primary)'
                  }}
                >
                  Accept Version B
                </button>
              </div>
            </div>

            {/* Custom Field Merge Picker */}
            <div
              className="p-4 rounded-[6px] border space-y-3"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border-main)'
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    Custom field merge
                  </h4>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Select individual field attributes from either side.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleResolve('custom')}
                  className="h-7 px-2.5 text-[11px] font-medium rounded-[6px] transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-text)'
                  }}
                >
                  Apply custom merge
                </button>
              </div>

              <div
                className="rounded-[6px] border divide-y overflow-hidden text-[12px]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-subtle)'
                }}
              >
                {Array.from(
                  new Set([
                    ...Object.keys(currentConflict?.aValue || {}),
                    ...Object.keys(currentConflict?.bValue || {})
                  ])
                ).map((field) => {
                  const valA = currentConflict?.aValue?.[field];
                  const valB = currentConflict?.bValue?.[field];
                  const chosen = customFieldPicks[field] || 'A';

                  return (
                    <div key={field} className="p-2.5 flex items-center justify-between gap-4">
                      <div className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                        {field}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomFieldPicks((prev) => ({ ...prev, [field]: 'A' }))}
                          className="px-2 py-1 rounded-[4px] border text-[11px] transition-colors cursor-pointer"
                          style={{
                            backgroundColor: chosen === 'A' ? 'var(--accent)' : 'transparent',
                            borderColor: chosen === 'A' ? 'var(--accent)' : 'var(--border-main)',
                            color: chosen === 'A' ? 'var(--accent-text)' : 'var(--text-secondary)'
                          }}
                        >
                          Source: {String(valA ?? 'null')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomFieldPicks((prev) => ({ ...prev, [field]: 'B' }))}
                          className="px-2 py-1 rounded-[4px] border text-[11px] transition-colors cursor-pointer"
                          style={{
                            backgroundColor: chosen === 'B' ? 'var(--accent)' : 'transparent',
                            borderColor: chosen === 'B' ? 'var(--accent)' : 'var(--border-main)',
                            color: chosen === 'B' ? 'var(--accent-text)' : 'var(--text-secondary)'
                          }}
                        >
                          Dest: {String(valB ?? 'null')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
