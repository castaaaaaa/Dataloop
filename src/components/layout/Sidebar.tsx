import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../lib/db/store';
import { useAuth } from '../../lib/auth/AuthContext';
import { BILLING_ENABLED } from '../../lib/billing/config';
import {
  LayoutDashboard,
  RefreshCw,
  Link2,
  AlertTriangle,
  Activity,
  Settings,
  BookOpen,
  ChevronDown,
  Check,
  AlertCircle,
  Plus,
  LogOut
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onRefreshState: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onRefreshState
}) => {
  const { user, signOut } = useAuth();
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentWorkspace = db.getCurrentWorkspace();
  const allUserWorkspaces = db.getUserWorkspaces(user?.id || db.currentUserId);
  const plan = db.getCurrentPlan();
  const limits = plan.limits;

  const conflictCount = db.getConflicts().length;
  const unresolvedErrors = db.getErrors().filter((e) => !e.isResolved).length;

  const totalLinkedRecords = db.recordLinks.length;
  const activeSyncsCount = db.getSyncConfigs().filter((s) => s.status === 'active').length;

  const recordsPercent = Math.min(100, Math.round((totalLinkedRecords / limits.maxRecords) * 100));
  const syncsPercent = Math.min(100, Math.round((activeSyncsCount / limits.maxActiveSyncs) * 100));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWorkspaceDropdownOpen(false);
        setIsCreatingWorkspace(false);
      }
    };
    if (workspaceDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [workspaceDropdownOpen]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'connections', label: 'Connections', icon: Link2 },
    {
      id: 'review_queue',
      label: 'Review queue',
      icon: AlertTriangle,
      badge: conflictCount > 0 ? conflictCount : undefined,
      badgeColor: 'var(--status-warning)'
    },
    {
      id: 'health',
      label: 'Health & errors',
      icon: AlertCircle,
      badge: unresolvedErrors > 0 ? unresolvedErrors : undefined,
      badgeColor: 'var(--status-danger)'
    },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'docs', label: 'Documentation', icon: BookOpen }
  ];

  const handleSwitchWorkspace = (wsId: string) => {
    db.currentWorkspaceId = wsId;
    setWorkspaceDropdownOpen(false);
    onRefreshState();
  };

  const handleCreateNewWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    const name = newWorkspaceName.trim();
    setNewWorkspaceName('');
    setIsCreatingWorkspace(false);
    setWorkspaceDropdownOpen(false);

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.id ? { 'x-user-id': user.id } : {})
        },
        body: JSON.stringify({ name })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          const exists = db.workspaces.some((w) => w.id === data.workspace.id);
          if (!exists) db.workspaces.push(data.workspace);
          db.currentWorkspaceId = data.workspace.id;
          onRefreshState();
          return;
        }
      }
    } catch (_e) {
      // fallback to store
    }

    const created = db.createWorkspace(name);
    db.currentWorkspaceId = created.id;
    onRefreshState();
  };

  return (
    <aside
      className="w-60 flex flex-col justify-between shrink-0 h-screen select-none border-r font-sans"
      style={{
        backgroundColor: 'var(--bg-sidebar)',
        borderColor: 'var(--border-main)',
        color: 'var(--text-secondary)'
      }}
    >
      {/* Top Section: Brand + Workspace Switcher */}
      <div>
        {/* Brand (tagline removed per brief) */}
        <div
          className="h-12 px-4 border-b flex items-center gap-2.5"
          style={{ borderColor: 'var(--border-main)' }}
        >
          <div
            className="w-6 h-6 rounded-[6px] flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </div>
          <span
            className="font-semibold text-[14px] tracking-tight leading-none"
            style={{ color: 'var(--text-primary)' }}
          >
            Dataloop
          </span>
        </div>

        {/* Workspace Switcher */}
        <div
          className="p-2 border-b relative"
          style={{ borderColor: 'var(--border-main)' }}
          ref={dropdownRef}
        >
          <button
            type="button"
            onClick={() => setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
            className="w-full flex items-center justify-between p-2 rounded-[6px] text-left transition-colors cursor-pointer border"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-main)',
              color: 'var(--text-primary)'
            }}
          >
            <div className="min-w-0 pr-2">
              <span
                className="text-[11px] block uppercase tracking-wider font-medium leading-tight"
                style={{ color: 'var(--text-muted)' }}
              >
                Workspace
              </span>
              <span className="text-[13px] font-medium truncate block leading-normal">
                {currentWorkspace.name}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          </button>

          {workspaceDropdownOpen && (
            <div
              className="absolute top-full left-2 right-2 mt-1 rounded-[6px] border shadow-lg z-50 py-1 text-[12px]"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-main)'
              }}
            >
              <div
                className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Workspaces
              </div>
              <div className="max-h-48 overflow-y-auto divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {allUserWorkspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => handleSwitchWorkspace(ws.id)}
                    className="w-full text-left px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer"
                    style={{
                      color: ws.id === currentWorkspace.id ? 'var(--accent)' : 'var(--text-primary)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === currentWorkspace.id && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>

              {/* Create workspace button or form */}
              <div className="p-2 border-t mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
                {isCreatingWorkspace ? (
                  <form onSubmit={handleCreateNewWorkspace} className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="Workspace name..."
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      autoFocus
                      className="w-full px-2 py-1 rounded-[6px] border text-[12px] focus:outline-hidden"
                      style={{
                        backgroundColor: 'var(--bg-raised)',
                        borderColor: 'var(--border-main)',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="submit"
                        className="flex-1 py-1 rounded-[6px] text-[11px] font-medium cursor-pointer"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--accent-text)'
                        }}
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingWorkspace(false);
                          setNewWorkspaceName('');
                        }}
                        className="px-2 py-1 rounded-[6px] text-[11px] cursor-pointer"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreatingWorkspace(true)}
                    className="w-full flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-left transition-colors cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    <span>New workspace</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Main Navigation (Simple text links with small icons, subtle active background) */}
        <nav className="p-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: isActive ? 'var(--bg-raised)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className="w-4 h-4 shrink-0"
                    style={{ color: isActive ? 'var(--accent)' : 'inherit' }}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className="inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold"
                    style={{
                      backgroundColor: 'var(--bg-raised)',
                      color: item.badgeColor || 'var(--text-primary)',
                      border: '1px solid var(--border-main)'
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Plan, Usage & Account in small muted text */}
      <div
        className="p-3 border-t space-y-3"
        style={{ borderColor: 'var(--border-main)' }}
      >
        {/* Plan & Usage Summary (Clean typography, no gradients or heavy cards) */}
        <div
          className="p-2.5 rounded-[6px] border text-[12px] space-y-2"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-main)'
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {BILLING_ENABLED && db.isTrialActive() ? 'Pro trial' : `${plan.name} plan`}
            </span>
            <span
              className="text-[11px] tabular-nums font-mono"
              style={{ color: 'var(--text-muted)' }}
            >
              {BILLING_ENABLED && db.isTrialActive() ? `${db.getTrialDaysRemaining()}d left` : 'Active'}
            </span>
          </div>

          {/* Usage Meters */}
          <div className="space-y-1.5 pt-1">
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Records</span>
                <span className="tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {totalLinkedRecords.toLocaleString()} / {limits.maxRecords.toLocaleString()}
                </span>
              </div>
              <div
                className="w-full h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-raised)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(2, recordsPercent)}%`,
                    backgroundColor: recordsPercent >= 80 ? 'var(--status-warning)' : 'var(--accent)'
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>
                <span>Pipelines</span>
                <span className="tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {activeSyncsCount} / {limits.maxActiveSyncs}
                </span>
              </div>
              <div
                className="w-full h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-raised)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(2, syncsPercent)}%`,
                    backgroundColor: 'var(--accent)'
                  }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="w-full py-1 text-center rounded-[6px] text-[11px] font-medium border transition-colors cursor-pointer mt-1"
            style={{
              backgroundColor: 'var(--bg-raised)',
              borderColor: 'var(--border-main)',
              color: 'var(--text-secondary)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            Manage plan
          </button>
        </div>

        {/* User Account & Logout */}
        <div
          className="pt-2 border-t flex items-center justify-between text-[12px]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 border"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border-main)',
                color: 'var(--text-primary)'
              }}
            >
              {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 leading-tight">
              <div
                className="font-medium truncate text-[12px]"
                style={{ color: 'var(--text-primary)' }}
              >
                {user?.name || user?.email || 'Logged in'}
              </div>
              <div
                className="text-[11px] truncate font-mono"
                style={{ color: 'var(--text-muted)' }}
              >
                {user?.email}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="p-1 rounded-[6px] transition-colors cursor-pointer shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-raised)';
              e.currentTarget.style.color = 'var(--status-danger)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
