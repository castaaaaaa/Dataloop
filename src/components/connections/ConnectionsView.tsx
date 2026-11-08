import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/db/store';
import { useAuth } from '../../lib/auth/AuthContext';
import { getAllConnectors } from '../../lib/connectors/registry';
import {
  Link2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Shield,
  Copy,
  Check,
  X
} from 'lucide-react';
import { ConnectedAccountRow } from '../../lib/db/schema';

interface ConnectionsViewProps {
  onRefresh: () => void;
}

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({ onRefresh }) => {
  const { user, session } = useAuth();
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState('google_sheets');
  const [accountDisplayName, setAccountDisplayName] = useState('');
  const [disconnectTarget, setDisconnectTarget] = useState<ConnectedAccountRow | null>(null);
  const [purgeDataOnDisconnect, setPurgeDataOnDisconnect] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch connections from the database on every page load and on refresh
  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const res = await fetch('/api/connections', { headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load connections from database');
      }
      setAccounts(data.accounts || []);
    } catch (err: any) {
      console.error('[ConnectionsView] Failed to load connections from database:', err);
      setErrorMessage(err.message || 'Database error loading connections');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle URL query parameters after OAuth redirect
  useEffect(() => {
    loadConnections();

    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const oauthError = params.get('oauth_error');

    if (connected === 'google_sheets') {
      setNotification('Authorized and connected Google Sheets account to Supabase database.');
      loadConnections();
      onRefresh();
      window.history.replaceState({}, document.title, window.location.pathname + '?tab=connections');
      setTimeout(() => setNotification(null), 5000);
    } else if (oauthError) {
      setErrorMessage(`Google OAuth Connection Failed: ${decodeURIComponent(oauthError)}`);
      window.history.replaceState({}, document.title, window.location.pathname + '?tab=connections');
    }
  }, [loadConnections, onRefresh]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const syncs = db.getSyncConfigs();
  const endpoints = db.getDataEndpoints();
  const connectors = getAllConnectors();

  const getUsedInSyncCount = (accountId: string, account?: ConnectedAccountRow) => {
    if (typeof account?.pipelineCount === 'number') {
      return account.pipelineCount;
    }
    const epIds = endpoints.filter((e) => e.connectedAccountId === accountId).map((e) => e.id);
    return syncs.filter((s) => epIds.includes(s.endpointAId) || epIds.includes(s.endpointBId) || (s as any).destinationAccountId === accountId).length;
  };

  const handleCreateConnection = async () => {
    const conn = connectors.find((c) => c.id === selectedConnectorId);
    if (!conn) return;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }

      const res = await fetch('/api/connections', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          connectorKey: selectedConnectorId,
          displayName: accountDisplayName.trim() || `${conn.displayName} (Account)`,
          scopes: conn.auth.requiredScopes
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create connection in database');
      }

      setConnectModalOpen(false);
      setAccountDisplayName('');
      setNotification(`Connected ${conn.displayName}.`);
      await loadConnections();
      onRefresh();
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Database error creating connection');
    }
  };

  const handleGoogleOAuthConnect = () => {
    const wsId = db.currentWorkspaceId;
    const uid = user?.id || db.currentUserId;
    window.location.href = `/api/auth/google?workspaceId=${encodeURIComponent(wsId)}&userId=${encodeURIComponent(uid)}`;
  };

  const handleReconnect = (account: ConnectedAccountRow) => {
    if (account.connectorKey === 'google_sheets') {
      const wsId = account.workspaceId || db.currentWorkspaceId;
      const uid = user?.id || db.currentUserId;
      window.location.href = `/api/auth/google?workspaceId=${encodeURIComponent(wsId)}&userId=${encodeURIComponent(uid)}&connectionId=${encodeURIComponent(account.id)}`;
      return;
    }
    window.location.href = `/api/auth/connect/${account.connectorKey}?connectionId=${encodeURIComponent(account.id)}`;
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget) return;

    const targetId = disconnectTarget.id;
    try {
      const headers: Record<string, string> = {
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }

      const res = await fetch(`/api/connections/${targetId}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to disconnect account from database');
      }

      setDisconnectTarget(null);
      setNotification(`Disconnected ${disconnectTarget.displayName}.`);
      await loadConnections();
      onRefresh();
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Database error disconnecting account');
    }
  };

  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const callbackUri = `${baseOrigin}/api/auth/google/callback`;

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-[24px] font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Connections
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Authorizations, API keys, and third-party data sources.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setConnectModalOpen(true)}
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
          <span>New connection</span>
        </button>
      </div>

      {errorMessage && (
        <div
          className="p-3.5 rounded-[6px] border flex items-start justify-between gap-3 text-[12px]"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--status-danger)',
            color: 'var(--text-primary)'
          }}
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--status-danger)' }} />
            <div>
              <span className="font-semibold block" style={{ color: 'var(--status-danger)' }}>
                Database Connection Error
              </span>
              <p className="mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {errorMessage}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="p-1 rounded transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {notification && (
        <div
          className="p-3 rounded-[6px] border flex items-center gap-2 text-[12px]"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--accent)',
            color: 'var(--text-primary)'
          }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
          <span>{notification}</span>
        </div>
      )}

      {/* Accounts Grid */}
      {loading && accounts.length === 0 ? (
        <div
          className="p-12 rounded-[6px] border text-center space-y-3"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <div
            className="w-5 h-5 mx-auto border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Loading connections from Supabase database...
          </p>
        </div>
      ) : accounts.length === 0 ? (
        <div
          className="p-12 rounded-[6px] border text-center space-y-2"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <Link2 className="w-6 h-6 mx-auto" style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
            No connections yet
          </h3>
          <p className="text-[12px] max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            Connect sources like Google Sheets, Airtable, Notion, or HubSpot to build sync pipelines.
          </p>
          <button
            type="button"
            onClick={() => setConnectModalOpen(true)}
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
            <span>Connect account</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map((acc) => {
            const usedCount = getUsedInSyncCount(acc.id, acc);

            return (
              <div
                key={acc.id}
                className="p-4 rounded-[6px] border space-y-3 flex flex-col justify-between"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-main)'
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3
                        className="text-[14px] font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {acc.displayName}
                      </h3>
                      <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        Connector: {acc.connectorKey}
                      </span>
                    </div>
                    {/* Dot status indicator */}
                    <span className="inline-flex items-center gap-1.5 text-[12px] capitalize shrink-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor:
                            acc.status === 'active'
                              ? 'var(--status-success)'
                              : acc.status === 'needs_reconnect'
                              ? 'var(--status-warning)'
                              : 'var(--status-danger)'
                        }}
                      />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {acc.status.replace(/_/g, ' ')}
                      </span>
                    </span>
                  </div>

                  {/* Scopes & Security Info */}
                  <div className="space-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      <span>
                        Encrypted credentials:{' '}
                        <strong
                          className={acc.credentialsStored || acc.encryptedAccessToken ? 'text-emerald-500' : 'text-amber-500'}
                          style={{
                            color: acc.credentialsStored || acc.encryptedAccessToken
                              ? 'var(--status-success)'
                              : 'var(--status-warning)'
                          }}
                        >
                          {acc.credentialsStored || acc.encryptedAccessToken ? 'stored' : 'missing'}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium">Scopes:</span>
                      <span className="font-mono text-[10px] truncate max-w-xs">
                        {acc.scopes.join(', ') || 'Standard read/write'}
                      </span>
                    </div>
                    <div>
                      Used in <strong style={{ color: 'var(--text-secondary)' }}>{usedCount} pipelines</strong>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div
                  className="pt-2.5 border-t flex items-center justify-between"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div>
                    {acc.status === 'needs_reconnect' && (
                      <button
                        type="button"
                        onClick={() => handleReconnect(acc)}
                        className="h-7 px-2 text-[11px] font-medium rounded-[6px] border flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-raised)',
                          borderColor: 'var(--border-main)',
                          color: 'var(--status-warning)'
                        }}
                      >
                        <RefreshCw className="w-3 h-3" /> Reconnect
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleReconnect(acc)}
                      className="w-7 h-7 flex items-center justify-center rounded-[6px] transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
                      title="Refresh credentials"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisconnectTarget(acc)}
                      className="w-7 h-7 flex items-center justify-center rounded-[6px] transition-colors cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                        e.currentTarget.style.color = 'var(--status-danger)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-muted)';
                      }}
                      title="Disconnect account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect Account Modal */}
      {connectModalOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="rounded-[6px] border max-w-md w-full p-5 space-y-4 shadow-xl"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-main)'
            }}
          >
            <div>
              <h3 className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Connect data source
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Select connector and authorize API access.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Connector
                </label>
                <select
                  value={selectedConnectorId}
                  onChange={(e) => setSelectedConnectorId(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-[6px] border text-[12px] focus:outline-hidden"
                  style={{
                    backgroundColor: 'var(--bg-raised)',
                    borderColor: 'var(--border-main)',
                    color: 'var(--text-primary)'
                  }}
                >
                  {connectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Account label (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production Airtable"
                  value={accountDisplayName}
                  onChange={(e) => setAccountDisplayName(e.target.value)}
                  className="w-full h-8 px-2.5 rounded-[6px] border text-[12px] focus:outline-hidden"
                  style={{
                    backgroundColor: 'var(--bg-raised)',
                    borderColor: 'var(--border-main)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {selectedConnectorId === 'google_sheets' && (
                <div
                  className="p-3 rounded-[6px] border space-y-2 text-[12px]"
                  style={{
                    backgroundColor: 'var(--bg-raised)',
                    borderColor: 'var(--border-main)'
                  }}
                >
                  <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>
                    Google Cloud redirect URI
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={callbackUri}
                      className="flex-1 h-7 px-2 font-mono text-[11px] rounded-[4px] border"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border-main)',
                        color: 'var(--text-secondary)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(callbackUri, 'cb')}
                      className="h-7 px-2 text-[11px] rounded-[4px] border flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border-main)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {copiedField === 'cb' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              className="pt-3 border-t flex items-center justify-end gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => setConnectModalOpen(false)}
                className="h-8 px-3 text-[12px] font-medium rounded-[6px] border transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'var(--border-main)',
                  color: 'var(--text-secondary)'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={selectedConnectorId === 'google_sheets' ? handleGoogleOAuthConnect : handleCreateConnection}
                className="h-8 px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-text)'
                }}
              >
                {selectedConnectorId === 'google_sheets' ? 'Authorize with Google OAuth' : 'Save connection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4 z-50"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="rounded-[6px] border max-w-md w-full p-5 space-y-4 shadow-xl"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-main)'
            }}
          >
            <div>
              <h3 className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                Disconnect {disconnectTarget.displayName}?
              </h3>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Pipelines depending on this connection will be paused. Tokens stored at rest will be revoked.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 text-[12px]">
              <input
                type="checkbox"
                id="purge"
                checked={purgeDataOnDisconnect}
                onChange={(e) => setPurgeDataOnDisconnect(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="purge" style={{ color: 'var(--text-secondary)' }}>
                Purge cached schema cache from database
              </label>
            </div>

            <div
              className="pt-3 border-t flex items-center justify-end gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                className="h-8 px-3 text-[12px] font-medium rounded-[6px] border transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: 'var(--border-main)',
                  color: 'var(--text-secondary)'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                className="h-8 px-3 text-[12px] font-medium rounded-[6px] transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--status-danger)',
                  color: '#FFFFFF'
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
